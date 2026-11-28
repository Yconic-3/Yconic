import { describe, expect, it } from "vitest";
import type { AgentChatRequest } from "@yconic/shared-types";
import { runUserAgent } from "../src/agent";
import { SCREEN_TOOLS, USER_AGENT_TOOLS } from "../src/tools";
import { fakeBackend, reply, scriptedModel } from "./helpers";

const HOME: AgentChatRequest["context"] = { screen: "home", exerciseId: null, sessionState: null, segmentIndex: null };
const ON_SQUAT: AgentChatRequest["context"] = { screen: "exercise", exerciseId: "c-squat", sessionState: "IN_PROGRESS", segmentIndex: 1 };
const ask = (message: string, context = HOME): AgentChatRequest => ({ message, context, history: [] });

/**
 * 화면 도구만 부른 차례는 도구에 함께 온 말(say)을 답으로 삼고 Claude를 다시 부르지 않는다 (docs/decisions/0019).
 * 가짜 모델에 두 번째 응답을 주지 않았으므로, 한 번 더 부르면 테스트가 실패한다.
 */
describe("조작 명령은 Claude를 한 번만 부른다", () => {
  it("운동을 열면 도구에 함께 온 말이 답이다", async () => {
    const model = scriptedModel([reply([{ tool: "open_exercise", input: { exercise_id: "c-squat", autoplay: true, say: "의자 잡고 스쿼트를 틀어 드릴게요." } }])]);
    const res = await runUserAgent(ask("스쿼트 틀어줘"), { model, backend: fakeBackend() });
    expect(res).toEqual({ reply: "의자 잡고 스쿼트를 틀어 드릴게요.", actions: [{ type: "OPEN_EXERCISE", exerciseId: "c-squat", autoplay: true }] });
    expect(model.requests).toHaveLength(1);
  });

  it("재생 조작, 말 속도, 화면 이동도 한 번에 끝난다", async () => {
    const next = scriptedModel([reply([{ tool: "control_playback", input: { command: "NEXT", say: "다음 단계로 넘어갈게요." } }])]);
    expect(await runUserAgent(ask("다음 거 하자", ON_SQUAT), { model: next, backend: fakeBackend() })).toEqual({
      reply: "다음 단계로 넘어갈게요.",
      actions: [{ type: "PLAYBACK", command: "NEXT" }],
    });
    const slower = scriptedModel([reply([{ tool: "change_speech_rate", input: { direction: "SLOWER", say: "조금 천천히 말할게요." } }])]);
    expect((await runUserAgent(ask("말이 너무 빨라"), { model: slower, backend: fakeBackend() })).reply).toBe("조금 천천히 말할게요.");
    const home = scriptedModel([reply([{ tool: "go_to", input: { destination: "HOME", say: "처음 화면으로 갈게요." } }])]);
    expect((await runUserAgent(ask("처음으로 가자", ON_SQUAT), { model: home, backend: fakeBackend() })).actions).toEqual([{ type: "NAVIGATE", destination: "HOME" }]);
    expect(next.requests.length + slower.requests.length + home.requests.length).toBe(3);
  });

  it("여러 화면 도구가 함께 오면 마지막 도구의 말을 읽는다", async () => {
    const model = scriptedModel([
      reply([
        { tool: "open_exercise", input: { exercise_id: "c-neck", autoplay: false, say: "목 스트레칭을 열게요." } },
        { tool: "change_speech_rate", input: { direction: "SLOWER", say: "목 스트레칭을 열고, 조금 천천히 말할게요." } },
      ]),
    ]);
    const res = await runUserAgent(ask("목 스트레칭 열고 천천히 말해줘"), { model, backend: fakeBackend() });
    expect(res.reply).toBe("목 스트레칭을 열고, 조금 천천히 말할게요.");
    expect(res.actions).toHaveLength(2);
    expect(model.requests).toHaveLength(1);
  });

  it("위험 신호로 멈추면 멈춤의 말을 읽고, 같은 말에서 나온 시작 조작은 버린다", async () => {
    const model = scriptedModel([
      reply([
        { tool: "control_playback", input: { command: "STOP", say: "운동을 멈췄어요. 편한 자세로 쉬시고, 계속 아프면 주변 사람이나 의료진의 도움을 받으세요." } },
        { tool: "control_playback", input: { command: "START", say: "이어서 할게요." } },
      ]),
    ]);
    const res = await runUserAgent(ask("무릎이 아파", ON_SQUAT), { model, backend: fakeBackend() });
    expect(res.reply).toMatch(/멈췄어요.*쉬시고/);
    expect(res.actions).toEqual([{ type: "PLAYBACK", command: "STOP" }]);
    expect(model.requests).toHaveLength(1);
  });
});

describe("결과를 보고 답해야 하면 한 번 더 부른다", () => {
  it("정보 도구가 섞여 있으면 결과를 돌려주고 다시 묻는다", async () => {
    const model = scriptedModel([
      reply([
        { tool: "search_exercises", input: { category: "ALL", keyword: "하체", show_on_screen: false } },
        { tool: "open_exercise", input: { exercise_id: "c-squat", autoplay: true, say: "스쿼트를 틀어 드릴게요." } },
      ]),
      reply([{ text: "하체 운동은 의자 잡고 스쿼트가 있어요. 틀어 드릴게요." }]),
    ]);
    const res = await runUserAgent(ask("하체 운동 하나 틀어줘"), { model, backend: fakeBackend() });
    expect(res.reply).toBe("하체 운동은 의자 잡고 스쿼트가 있어요. 틀어 드릴게요.");
    expect(model.requests).toHaveLength(2);
  });

  it("화면 도구가 실패하면(없는 운동, 운동 화면이 아님) 그 말을 읽지 않고 다시 묻는다", async () => {
    const missing = scriptedModel([
      reply([{ tool: "open_exercise", input: { exercise_id: "c-nope", autoplay: true, say: "런지를 틀어 드릴게요." } }]),
      reply([{ text: "그 운동은 아직 없어요." }]),
    ]);
    expect(await runUserAgent(ask("런지 틀어줘"), { model: missing, backend: fakeBackend() })).toEqual({ reply: "그 운동은 아직 없어요.", actions: [] });

    const notOnExercise = scriptedModel([
      reply([{ tool: "control_playback", input: { command: "NEXT", say: "다음 단계로 넘어갈게요." } }]),
      reply([{ text: "먼저 운동을 골라 주세요." }]),
    ]);
    expect((await runUserAgent(ask("다음"), { model: notOnExercise, backend: fakeBackend() })).reply).toBe("먼저 운동을 골라 주세요.");
    expect(notOnExercise.requests).toHaveLength(2);
  });

  it("말이 비어 있으면 예전처럼 한 번 더 불러 답을 받는다", async () => {
    const model = scriptedModel([
      reply([{ tool: "open_exercise", input: { exercise_id: "c-squat", autoplay: true, say: "  " } }]),
      reply([{ text: "스쿼트를 틀어 드릴게요." }]),
    ]);
    expect((await runUserAgent(ask("스쿼트 틀어줘"), { model, backend: fakeBackend() })).reply).toBe("스쿼트를 틀어 드릴게요.");
    expect(model.requests).toHaveLength(2);
  });

  it("끄면(singleCall: false) 화면 도구만 불러도 한 번 더 부른다", async () => {
    const model = scriptedModel([
      reply([{ tool: "open_exercise", input: { exercise_id: "c-squat", autoplay: true, say: "스쿼트를 틀어 드릴게요." } }]),
      reply([{ text: "의자 잡고 스쿼트를 열었어요." }]),
    ]);
    const res = await runUserAgent(ask("스쿼트 틀어줘"), { model, backend: fakeBackend(), singleCall: false });
    expect(res.reply).toBe("의자 잡고 스쿼트를 열었어요.");
    expect(model.requests).toHaveLength(2);
  });
});

describe("도구 정의", () => {
  it("화면 도구는 모두 say를 꼭 받고, 정보 도구는 받지 않는다", () => {
    for (const tool of USER_AGENT_TOOLS) {
      const schema = tool.input_schema as { properties: Record<string, unknown>; required: string[] };
      expect(schema.required.includes("say"), tool.name).toBe(SCREEN_TOOLS.has(tool.name));
      expect("say" in schema.properties, tool.name).toBe(SCREEN_TOOLS.has(tool.name));
    }
    expect([...SCREEN_TOOLS].sort()).toEqual(["change_speech_rate", "control_playback", "go_to", "open_exercise"]);
  });
});
