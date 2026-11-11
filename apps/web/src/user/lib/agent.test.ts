import { describe, expect, it } from "vitest";
import type { AgentChatRequest } from "@yconic/shared-types";
import { createAgentClient, handleLocally, splitAgentActions } from "./agent";
import { parseIntent } from "./intent";

const REQUEST: AgentChatRequest = {
  message: "하체 운동 있어?",
  history: [],
  context: { screen: "home", exerciseId: null, sessionState: null, segmentIndex: null },
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** 주소별로 정해 둔 응답을 돌려주는 가짜 fetch */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = Object.keys(routes).find((k) => url.endsWith(k));
    if (!route) throw new TypeError("fetch failed");
    return routes[route]!();
  }) as typeof fetch;
  return { fn, calls };
}

describe("createAgentClient", () => {
  it("AI가 켜져 있으면 답을 받는다", async () => {
    const answer = { reply: "스쿼트가 있어요.", actions: [] };
    const { fn } = fakeFetch({ "/health": () => json(200, { ok: true, ai: true }), "/chat": () => json(200, answer) });
    expect(await createAgentClient("http://a", fn).chat(REQUEST)).toEqual(answer);
  });

  it("AI가 꺼져 있으면 null이고, 잠시 동안은 다시 묻지 않는다", async () => {
    let t = 0;
    const { fn, calls } = fakeFetch({ "/health": () => json(200, { ok: true, ai: false }) });
    const client = createAgentClient("http://a", fn, () => t);
    expect(await client.chat(REQUEST)).toBeNull();
    expect(await client.chat(REQUEST)).toBeNull();
    expect(calls).toHaveLength(1);
    t = 31_000;
    await client.chat(REQUEST);
    expect(calls).toHaveLength(2);
  });

  it("서버가 꺼져 있거나 일시 오류면 null", async () => {
    expect(await createAgentClient("http://a", fakeFetch({}).fn).chat(REQUEST)).toBeNull();
    const busy = fakeFetch({ "/health": () => json(200, { ok: true, ai: true }), "/chat": () => json(503, { code: "AI_BUSY" }) });
    const client = createAgentClient("http://a", busy.fn);
    expect(await client.chat(REQUEST)).toBeNull();
    // 일시 오류 뒤에는 다음 말을 다시 보낸다
    await client.chat(REQUEST);
    expect(busy.calls.filter((c) => c.endsWith("/chat"))).toHaveLength(2);
  });
});

describe("handleLocally", () => {
  const local = (text: string, onExercise = true) => handleLocally(parseIntent(text, []), text, onExercise);

  it("위험 신호는 길이·화면과 상관없이 바로 처리한다", () => {
    expect(local("운동하다가 갑자기 무릎이 너무 아파요", false)).toBe(true);
  });

  it("운동 화면의 짧은 조작은 바로, 질문이나 긴 말은 에이전트로", () => {
    expect(local("다음")).toBe(true);
    expect(local("멈춰")).toBe(true);
    expect(local("홈")).toBe(true);
    expect(local("하체 운동 찾아줘")).toBe(false);
    expect(local("다음 단계는 뭘 하는 거야?")).toBe(false);
    expect(local("오늘 뭐 하면 좋을까")).toBe(false);
  });

  it("운동 화면이 아니면 '그거 할래' 같은 말은 앞 대화를 아는 에이전트로 보낸다", () => {
    expect(local("그거 할래", false)).toBe(false);
    expect(local("그거 할래", true)).toBe(true);
    expect(local("느리게", false)).toBe(true);
  });
});

describe("splitAgentActions", () => {
  it("안내를 읽기 시작하는 조작은 답을 읽은 뒤로 미룬다", () => {
    const { before, after } = splitAgentActions([
      { type: "SHOW_LIST", category: null, keyword: "하체" },
      { type: "OPEN_EXERCISE", exerciseId: "c-squat", autoplay: true },
      { type: "PLAYBACK", command: "STOP" },
      { type: "PLAYBACK", command: "NEXT" },
      { type: "OPEN_EXERCISE", exerciseId: "c-neck", autoplay: false },
    ]);
    expect(before.map((a) => a.type)).toEqual(["SHOW_LIST", "PLAYBACK", "OPEN_EXERCISE"]);
    expect(after).toEqual([
      { type: "OPEN_EXERCISE", exerciseId: "c-squat", autoplay: true },
      { type: "PLAYBACK", command: "NEXT" },
    ]);
  });
});
