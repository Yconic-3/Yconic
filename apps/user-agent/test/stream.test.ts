import { afterEach, describe, expect, it } from "vitest";
import { AiError, type AgentRequest, type AiModel, type ClaudeMessage, type RunOptions } from "@yconic/ai-common";
import type { AgentAction, AgentChatRequest, AgentStreamEvent } from "@yconic/shared-types";
import { REFUSAL_REPLY, runUserAgent } from "../src/agent";
import { fakeBackend, reply, startServer } from "./helpers";

const HOME: AgentChatRequest["context"] = { screen: "home", exerciseId: null, sessionState: null, segmentIndex: null };
const ask = (message: string): AgentChatRequest => ({ message, context: HOME, history: [] });

interface Step {
  /** 이 차례에 글자가 나오는 대로 넘길 조각들 */
  deltas?: string[];
  message: ClaudeMessage;
}

/** 글자를 조각으로 넘겨 주는 가짜 모델. 스트리밍으로 불렸는지도 기억한다 */
function streamingModel(steps: Step[]): AiModel & { options: (RunOptions | undefined)[] } {
  const queue = [...steps];
  const options: (RunOptions | undefined)[] = [];
  return {
    name: "fake-stream",
    options,
    async run(_request: AgentRequest, opts?: RunOptions) {
      options.push(opts);
      const next = queue.shift();
      if (!next) throw new Error("준비한 응답이 없습니다");
      for (const d of next.deltas ?? []) opts?.onText?.(d);
      return next.message;
    },
  };
}

/** 중간에 알린 것을 차례대로 모은다 */
function recorder() {
  const events: string[] = [];
  return {
    events,
    hooks: {
      onText: (d: string) => events.push(`text:${d}`),
      onReset: () => events.push("reset"),
      onActions: (a: AgentAction[]) => events.push(`actions:${a.map((x) => x.type).join(",")}`),
    },
  };
}

describe("runUserAgent: 답을 글자가 나오는 대로 알린다", () => {
  it("도구 없이 답하면 글자를 그대로 넘기고, 끝난 답은 예전과 같다", async () => {
    const model = streamingModel([{ deltas: ["스쿼트는 ", "엉덩이를 뒤로 빼며 앉아요. ", "무릎이 아프면 조금만 굽히세요."], message: reply([{ text: "스쿼트는 엉덩이를 뒤로 빼며 앉아요. 무릎이 아프면 조금만 굽히세요." }]) }]);
    const r = recorder();
    const res = await runUserAgent(ask("스쿼트 어떻게 해?"), { model, backend: fakeBackend() }, r.hooks);
    expect(r.events).toEqual(["text:스쿼트는 ", "text:엉덩이를 뒤로 빼며 앉아요. ", "text:무릎이 아프면 조금만 굽히세요."]);
    expect(res).toEqual({ reply: "스쿼트는 엉덩이를 뒤로 빼며 앉아요. 무릎이 아프면 조금만 굽히세요.", actions: [] });
  });

  it("도구를 쓴 뒤 답하면, 할 일을 먼저 알리고 그다음 글자를 넘긴다", async () => {
    const model = streamingModel([
      { message: reply([{ tool: "search_exercises", input: { category: "ALL", keyword: "하체", show_on_screen: true } }]) },
      { deltas: ["하체 운동은 ", "스쿼트가 있어요."], message: reply([{ text: "하체 운동은 스쿼트가 있어요." }]) },
    ]);
    const r = recorder();
    const res = await runUserAgent(ask("하체 운동 찾아줘"), { model, backend: fakeBackend() }, r.hooks);
    expect(r.events).toEqual(["actions:SHOW_LIST", "text:하체 운동은 ", "text:스쿼트가 있어요."]);
    expect(res.reply).toBe("하체 운동은 스쿼트가 있어요.");
  });

  it("할 일이 없는 도구(자세히 보기)를 쓴 뒤에는 할 일을 알리지 않는다", async () => {
    const model = streamingModel([
      { message: reply([{ tool: "get_exercise_detail", input: { exercise_id: "c-squat" } }]) },
      { deltas: ["무릎이 아프면 멈추세요."], message: reply([{ text: "무릎이 아프면 멈추세요." }]) },
    ]);
    const r = recorder();
    await runUserAgent(ask("스쿼트 주의할 점 알려줘"), { model, backend: fakeBackend() }, r.hooks);
    expect(r.events).toEqual(["text:무릎이 아프면 멈추세요."]);
  });

  it("도구를 부르는 차례에 나온 글은 답이 아니므로 버리게 한다", async () => {
    const model = streamingModel([
      { deltas: ["찾아볼게요."], message: reply([{ text: "찾아볼게요." }, { tool: "get_exercise_detail", input: { exercise_id: "c-squat" } }]) },
      { deltas: ["천천히 앉았다 일어나세요."], message: reply([{ text: "천천히 앉았다 일어나세요." }]) },
    ]);
    const r = recorder();
    const res = await runUserAgent(ask("스쿼트 알려줘"), { model, backend: fakeBackend() }, r.hooks);
    expect(r.events).toEqual(["text:찾아볼게요.", "reset", "text:천천히 앉았다 일어나세요."]);
    expect(res.reply).toBe("천천히 앉았다 일어나세요.");
  });

  it("화면 도구만 부른 차례(한 번에 끝나는 조작)는 글자를 넘기지 않고 끝낸다", async () => {
    const model = streamingModel([{ message: reply([{ tool: "open_exercise", input: { exercise_id: "c-squat", autoplay: true, say: "스쿼트를 틀어 드릴게요." } }]) }]);
    const r = recorder();
    const res = await runUserAgent(ask("스쿼트 틀어줘"), { model, backend: fakeBackend() }, r.hooks);
    expect(r.events).toEqual([]);
    expect(res.reply).toBe("스쿼트를 틀어 드릴게요.");
  });

  it("거절되면 이미 넘긴 글을 버리게 하고 정해 둔 말로 답한다", async () => {
    const model = streamingModel([{ deltas: ["그건 "], message: reply([{ text: "그건 " }], "refusal") }]);
    const r = recorder();
    const res = await runUserAgent(ask("이상한 요청"), { model, backend: fakeBackend() }, r.hooks);
    expect(r.events).toEqual(["text:그건 ", "reset"]);
    expect(res.reply).toBe(REFUSAL_REPLY);
  });

  it("너무 긴 답은 자르는 곳까지만 넘긴다 (끝난 답과 어긋나지 않게)", async () => {
    const long = "가".repeat(400);
    const model = streamingModel([{ deltas: [long, long, long], message: reply([{ text: long + long + long }]) }]);
    const r = recorder();
    const res = await runUserAgent(ask("길게 말해줘"), { model, backend: fakeBackend() }, r.hooks);
    const sent = r.events.map((e) => e.slice("text:".length)).join("");
    expect(sent).toHaveLength(599);
    expect(res.reply.startsWith(sent)).toBe(true);
  });

  it("알릴 곳이 없으면(POST /chat) 스트리밍으로 부르지 않는다", async () => {
    const model = streamingModel([{ deltas: ["네."], message: reply([{ text: "네." }]) }]);
    await runUserAgent(ask("안녕"), { model, backend: fakeBackend() });
    expect(model.options).toEqual([undefined]);
  });
});

describe("POST /chat/stream", () => {
  let close: (() => Promise<void>) | null = null;
  afterEach(async () => {
    await close?.();
    close = null;
  });
  const BODY = { message: "스쿼트 어떻게 해?", history: [], context: HOME };
  async function post(model: AiModel | null, body: unknown = BODY) {
    const s = await startServer({ model });
    close = s.close;
    return fetch(`${s.url}/chat/stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  const lines = async (res: Response) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as AgentStreamEvent);

  it("글자, 할 일, 끝을 한 줄에 하나씩 보낸다. 프록시가 모아 두지 않게 하는 머리말을 붙인다", async () => {
    const res = await post(
      streamingModel([
        { message: reply([{ tool: "search_exercises", input: { category: "ALL", keyword: "하체", show_on_screen: true } }]) },
        { deltas: ["하체 운동은 ", "스쿼트가 있어요."], message: reply([{ text: "하체 운동은 스쿼트가 있어요." }]) },
      ]),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/x-ndjson/);
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(await lines(res)).toEqual([
      { type: "actions", actions: [{ type: "SHOW_LIST", category: null, keyword: "하체" }] },
      { type: "text", delta: "하체 운동은 " },
      { type: "text", delta: "스쿼트가 있어요." },
      { type: "done", response: { reply: "하체 운동은 스쿼트가 있어요.", actions: [{ type: "SHOW_LIST", category: null, keyword: "하체" }] } },
    ]);
  });

  it("답을 만들다 실패하면 error 줄로 알린다", async () => {
    const failing: AiModel = {
      name: "failing",
      async run(_r, opts) {
        opts?.onText?.("잠깐");
        throw new AiError("AI_BUSY", "지금 AI가 바쁩니다.");
      },
    };
    const res = await post(failing);
    expect(res.status).toBe(200);
    const events = await lines(res);
    expect(events[0]).toEqual({ type: "text", delta: "잠깐" });
    expect(events.at(-1)).toMatchObject({ type: "error", code: "AI_BUSY" });
  });

  it("시작하기 전의 오류(틀린 요청, AI 꺼짐)는 예전처럼 상태 코드로 알린다", async () => {
    const bad = await post(streamingModel([]), { message: "", history: [], context: HOME });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { code: string }).code).toBe("VALIDATION");
    await close?.();
    const off = await post(null);
    expect(off.status).toBe(503);
    expect(((await off.json()) as { code: string }).code).toBe("AI_DISABLED");
  });
});
