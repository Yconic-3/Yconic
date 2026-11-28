import { describe, expect, it } from "vitest";
import type { AgentAction, AgentChatRequest, AgentStreamEvent } from "@yconic/shared-types";
import { createAgentClient } from "./agent";

const REQUEST: AgentChatRequest = {
  message: "스쿼트 어떻게 해?",
  history: [],
  context: { screen: "home", exerciseId: null, sessionState: null, segmentIndex: null },
};
const ANSWER = { reply: "천천히 앉았다 일어나세요. 무릎이 아프면 멈추세요.", actions: [] };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** 이벤트를 한 줄씩, 정해 둔 조각 크기로 잘라 보내는 스트림 응답 (줄이 조각 사이에 걸쳐도 되는지 보려고) */
function ndjson(events: AgentStreamEvent[], chunkSize = 7, cutShort = false): Response {
  const bytes = new TextEncoder().encode(events.map((e) => JSON.stringify(e) + "\n").join(""));
  const end = cutShort ? bytes.length - 20 : bytes.length;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < end; i += chunkSize) controller.enqueue(bytes.slice(i, Math.min(i + chunkSize, end)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}

function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url.replace("http://a", ""));
    const route = Object.keys(routes).find((k) => url.endsWith(k));
    if (!route) throw new TypeError("fetch failed");
    return routes[route]!();
  }) as typeof fetch;
  return { fn, calls };
}

function recorder() {
  const events: string[] = [];
  return {
    events,
    handlers: {
      onText: (d: string) => events.push(`text:${d}`),
      onReset: () => events.push("reset"),
      onActions: (a: AgentAction[]) => events.push(`actions:${a.length}`),
    },
  };
}

const HEALTHY = { "/health": () => json(200, { ok: true, ai: true }) };

describe("createAgentClient.chatStream", () => {
  it("글자·버리기·할 일을 온 차례대로 알리고, 끝난 답을 돌려준다", async () => {
    const { fn } = fakeFetch({
      ...HEALTHY,
      "/chat/stream": () =>
        ndjson([
          { type: "text", delta: "찾아볼게요." },
          { type: "reset" },
          { type: "actions", actions: [] },
          { type: "text", delta: "천천히 앉았다 일어나세요. " },
          { type: "text", delta: "무릎이 아프면 멈추세요." },
          { type: "done", response: ANSWER },
        ]),
    });
    const r = recorder();
    expect(await createAgentClient("http://a", fn).chatStream(REQUEST, r.handlers)).toEqual(ANSWER);
    expect(r.events).toEqual(["text:찾아볼게요.", "reset", "actions:0", "text:천천히 앉았다 일어나세요. ", "text:무릎이 아프면 멈추세요."]);
  });

  it("에이전트가 스트림을 모르면(404) 예전 방식으로 받고, 다음부터는 묻지 않는다", async () => {
    const { fn, calls } = fakeFetch({ ...HEALTHY, "/chat/stream": () => json(404, { code: "NOT_FOUND" }), "/chat": () => json(200, ANSWER) });
    const client = createAgentClient("http://a", fn);
    const r = recorder();
    expect(await client.chatStream(REQUEST, r.handlers)).toEqual(ANSWER);
    expect(await client.chatStream(REQUEST, r.handlers)).toEqual(ANSWER);
    expect(r.events).toEqual([]);
    expect(calls).toEqual(["/health", "/chat/stream", "/chat", "/chat"]);
  });

  it("스트림이 아니라 통째로 온 답도 받는다", async () => {
    const { fn } = fakeFetch({ ...HEALTHY, "/chat/stream": () => json(200, ANSWER) });
    expect(await createAgentClient("http://a", fn).chatStream(REQUEST, {})).toEqual(ANSWER);
  });

  it("중간에 실패했다고 알리거나 끝을 받지 못하고 끊기면 null이다 (화면이 규칙으로 처리한다)", async () => {
    const failed = fakeFetch({ ...HEALTHY, "/chat/stream": () => ndjson([{ type: "text", delta: "잠깐" }, { type: "error", code: "AI_BUSY", message: "바쁩니다" }]) });
    const r = recorder();
    expect(await createAgentClient("http://a", failed.fn).chatStream(REQUEST, r.handlers)).toBeNull();
    expect(r.events).toEqual(["text:잠깐"]);

    const cut = fakeFetch({ ...HEALTHY, "/chat/stream": () => ndjson([{ type: "text", delta: "천천히" }, { type: "done", response: ANSWER }], 7, true) });
    expect(await createAgentClient("http://a", cut.fn).chatStream(REQUEST, {})).toBeNull();
  });

  it("AI가 꺼져 있으면 부르지 않고, 일시 오류는 이번 말만 null이다", async () => {
    const off = fakeFetch({ "/health": () => json(200, { ok: true, ai: false }) });
    expect(await createAgentClient("http://a", off.fn).chatStream(REQUEST, {})).toBeNull();
    expect(off.calls).toEqual(["/health"]);

    const busy = fakeFetch({ ...HEALTHY, "/chat/stream": () => json(429, { code: "RATE_LIMITED" }) });
    const client = createAgentClient("http://a", busy.fn);
    expect(await client.chatStream(REQUEST, {})).toBeNull();
    await client.chatStream(REQUEST, {});
    // 다음 말에 다시 묻는다 (한동안 끄지 않는다)
    expect(busy.calls).toEqual(["/health", "/chat/stream", "/chat/stream"]);
  });
});
