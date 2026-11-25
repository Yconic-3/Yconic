import { AiError } from "@yconic/ai-common";
import { BackendUnavailableError, parseChatRequest, runUserAgent, ValidationError } from "@yconic/user-agent/core";
import { agentInWebEnabled, agentModel, allowRequest, fixtureBackend } from "@/server/agent-in-web";

/**
 * 웹앱 안 에이전트의 대화 (Vercel 배포용, docs/decisions/0012). 4100번 에이전트 서버의 POST /chat 과 같은 약속이다.
 * 판단 규칙은 apps/user-agent 의 핵심을 그대로 쓴다.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status });
}

export async function POST(req: Request) {
  if (!agentInWebEnabled()) return fail(404, "NOT_FOUND", "이 배포에서는 에이전트를 쓰지 않습니다.");
  const model = agentModel();
  if (!model) return fail(503, "AI_DISABLED", "AI가 꺼져 있습니다.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (!allowRequest(ip)) return fail(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 뒤 다시 말씀해 주세요.");
  try {
    const request = parseChatRequest(await req.json().catch(() => null));
    return Response.json(await runUserAgent(request, { model, backend: fixtureBackend }));
  } catch (e) {
    if (e instanceof ValidationError) return fail(400, "VALIDATION", e.message);
    if (e instanceof BackendUnavailableError) return fail(503, "BACKEND_UNAVAILABLE", e.message);
    if (e instanceof AiError) return fail(503, e.code === "AI_AUTH" ? "AI_DISABLED" : "AI_BUSY", e.message);
    return fail(500, "INTERNAL", "에이전트가 답하지 못했습니다.");
  }
}
