import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AiError, type AiModel } from "@yconic/ai-common";
import type { AgentErrorCode, AgentHealth } from "@yconic/shared-types";
import { runUserAgent } from "./agent";
import { BackendUnavailableError, type Backend } from "./backend";
import type { AgentConfig } from "./config";
import { parseChatRequest, ValidationError } from "./validate";

/**
 * 사용자 에이전트 HTTP 서버.
 *   GET  /health → { ok, ai }
 *   POST /chat   → { reply, actions }
 * 로그인 없이 쓸 수 있는 사용자 화면용이라, IP마다 1분 요청 수를 제한해 AI 비용이 새지 않게 한다.
 */

const BODY_LIMIT = 32 * 1024;

export interface AgentServerOptions {
  config: Pick<AgentConfig, "webOrigins" | "rateLimitPerMinute">;
  /** null이면 AI가 꺼져 있다 (API 키 없음) */
  model: AiModel | null;
  backend: Backend;
  quiet?: boolean;
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: AgentErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers["content-type"] ?? "").includes("application/json")) {
    throw new HttpError(415, "VALIDATION", "JSON으로 보내 주세요.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > BODY_LIMIT) throw new HttpError(413, "VALIDATION", "요청이 너무 큽니다.");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "VALIDATION", "JSON 형식이 올바르지 않습니다.");
  }
}

/** IP마다 최근 1분 요청 시각을 기억한다 */
function createRateLimiter(limit: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear();
    return true;
  };
}

function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof ValidationError) return new HttpError(400, "VALIDATION", error.message);
  if (error instanceof BackendUnavailableError) {
    return new HttpError(502, "BACKEND_UNAVAILABLE", "운동 정보를 가져오지 못했습니다. API 서버(pnpm dev:api)를 확인해 주세요.");
  }
  if (error instanceof AiError) {
    return error.code === "AI_BUSY"
      ? new HttpError(503, "AI_BUSY", error.message)
      : new HttpError(502, "AI_FAILED", "AI가 요청을 처리하지 못했습니다.");
  }
  return new HttpError(500, "UNKNOWN", "에이전트에서 오류가 났습니다.");
}

export function createAgentServer({ config, model, backend, quiet }: AgentServerOptions): Server {
  const allow = createRateLimiter(config.rateLimitPerMinute);

  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && config.webOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    const path = (req.url ?? "/").split("?")[0];

    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
        });
        res.end();
        return;
      }
      if (req.method === "GET" && path === "/health") {
        send(res, 200, { ok: true, ai: model !== null } satisfies AgentHealth);
        return;
      }
      if (req.method === "POST" && path === "/chat") {
        if (!allow(req.socket.remoteAddress ?? "?")) {
          throw new HttpError(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 뒤 다시 말씀해 주세요.");
        }
        const request = parseChatRequest(await readJson(req));
        if (!model) throw new HttpError(503, "AI_DISABLED", "AI가 꺼져 있습니다 (ANTHROPIC_API_KEY 없음).");
        send(res, 200, await runUserAgent(request, { model, backend }));
        return;
      }
      throw new HttpError(404, "NOT_FOUND", "없는 주소입니다.");
    } catch (e) {
      const error = toHttpError(e);
      if (error.status >= 500 && !quiet) console.error("[user-agent]", e);
      send(res, error.status, { code: error.code, message: error.message });
    }
  });
}
