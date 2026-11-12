import { afterEach, describe, expect, it } from "vitest";
import { AiError } from "@yconic/ai-common";
import { BackendUnavailableError } from "../src/backend";
import { reply, scriptedModel, startServer } from "./helpers";

const BODY = { message: "하체 운동 찾아줘", history: [], context: { screen: "home", exerciseId: null, sessionState: null, segmentIndex: null } };

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function start(...args: Parameters<typeof startServer>) {
  const s = await startServer(...args);
  close = s.close;
  return s.url;
}

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${url}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("에이전트 서버", () => {
  it("health는 AI가 켜졌는지 알려 준다", async () => {
    const url = await start({ model: null });
    expect(await (await fetch(`${url}/health`)).json()).toEqual({ ok: true, ai: false });
  });

  it("키가 없으면 /chat은 503 AI_DISABLED", async () => {
    const url = await start({ model: null });
    const res = await post(url, BODY);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "AI_DISABLED" });
  });

  it("대화하면 답과 할 일을 돌려주고, 허용한 웹앱 주소만 CORS를 연다", async () => {
    const model = scriptedModel([reply([{ text: "찾아볼게요." }])]);
    const url = await start({ model });
    const res = await post(url, BODY);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(await res.json()).toEqual({ reply: "찾아볼게요.", actions: [] });

    const other = await post(url, BODY, { Origin: "http://evil.example" });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("요청 모양이 틀리면 400", async () => {
    const url = await start({ model: scriptedModel([]) });
    expect((await post(url, { ...BODY, message: "" })).status).toBe(400);
    expect((await post(url, { ...BODY, context: { screen: "어딘가" } })).status).toBe(400);
    expect((await post(url, { ...BODY, message: "가".repeat(501) })).status).toBe(400);
    expect((await post(url, "{깨진 json")).status).toBe(400);
  });

  it("1분 요청 수를 넘으면 429", async () => {
    const url = await start({ model: scriptedModel([reply([{ text: "네" }]), reply([{ text: "네" }])]), rateLimitPerMinute: 2 });
    expect((await post(url, BODY)).status).toBe(200);
    expect((await post(url, BODY)).status).toBe(200);
    const res = await post(url, BODY);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("AI가 바쁘면 503 AI_BUSY, 백엔드가 꺼져 있으면 502", async () => {
    const busy = { name: "fake", run: () => Promise.reject(new AiError("AI_BUSY", "바쁨")) };
    let url = await start({ model: busy });
    expect(await (await post(url, BODY)).json()).toMatchObject({ code: "AI_BUSY" });
    await close!();

    const down = { listExercises: () => Promise.reject(new BackendUnavailableError(new Error("x"))) };
    url = await start({ model: scriptedModel([]), backend: down });
    const res = await post(url, BODY);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "BACKEND_UNAVAILABLE" });
  });
});
