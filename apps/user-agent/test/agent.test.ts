import { describe, expect, it } from "vitest";
import type { AgentChatRequest } from "@yconic/shared-types";
import { NOT_UNDERSTOOD_REPLY, REFUSAL_REPLY, runUserAgent } from "../src/agent";
import { fakeBackend, reply, scriptedModel } from "./helpers";

const HOME: AgentChatRequest["context"] = { screen: "home", exerciseId: null, sessionState: null, segmentIndex: null };
const ON_SQUAT: AgentChatRequest["context"] = { screen: "exercise", exerciseId: "c-squat", sessionState: "IN_PROGRESS", segmentIndex: 1 };

function ask(message: string, context = HOME, history: AgentChatRequest["history"] = []): AgentChatRequest {
  return { message, context, history };
}

function toolResults(request: { messages: unknown[] }) {
  const last = request.messages.at(-1) as { content: { type: string; content: string; is_error?: boolean }[] };
  return last.content.filter((b) => b.type === "tool_result");
}

describe("runUserAgent", () => {
  it("운동을 찾으면 목록을 거르고, 도구 결과를 보고 답한다", async () => {
    const model = scriptedModel([
      reply([{ tool: "search_exercises", input: { category: "ALL", keyword: "하체", show_on_screen: true } }]),
      reply([{ text: "하체 운동은 의자 잡고 스쿼트가 있어요." }]),
    ]);
    const res = await runUserAgent(ask("하체 운동 찾아줘"), { model, backend: fakeBackend() });

    expect(res).toEqual({
      reply: "하체 운동은 의자 잡고 스쿼트가 있어요.",
      actions: [{ type: "SHOW_LIST", category: null, keyword: "하체" }],
    });
    const [result] = toolResults(model.requests[1]!);
    expect(JSON.parse(result!.content)).toMatchObject({ total: 1, exercises: [{ id: "c-squat", title: "의자 잡고 스쿼트" }] });
  });

  it("첫 요청에 앱 상태와 공개 운동 목록을 붙이고, 앞쪽의 비서 인사는 뺀다", async () => {
    const model = scriptedModel([reply([{ text: "네." }])]);
    await runUserAgent(
      ask("지금 몇 단계야?", ON_SQUAT, [
        { role: "assistant", text: "안녕하세요." },
        { role: "user", text: "스쿼트 시작" },
        { role: "assistant", text: "시작할게요." },
      ]),
      { model, backend: fakeBackend() },
    );
    const { messages } = model.requests[0]!;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const last = messages.at(-1)!.content as { text: string }[];
    expect(last[0]!.text).toContain("운동 화면 — 의자 잡고 스쿼트 (id c-squat)");
    expect(last[0]!.text).toContain("지금 단계: 2단계 앉았다 일어서기");
    expect(last[0]!.text).toContain("id c-neck: 앉아서 하는 목 스트레칭");
    expect(last[1]!.text).toBe("지금 몇 단계야?");
  });

  it("공개되지 않은 id로 운동을 열려 하면 오류로 돌려주고 할 일은 없다", async () => {
    const model = scriptedModel([
      reply([{ tool: "open_exercise", input: { exercise_id: "c2", autoplay: true } }]),
      reply([{ text: "그 운동은 찾을 수 없어요." }]),
    ]);
    const res = await runUserAgent(ask("검수 중인 운동 열어줘"), { model, backend: fakeBackend() });
    expect(res.actions).toEqual([]);
    const [result] = toolResults(model.requests[1]!);
    expect(result!.is_error).toBe(true);
  });

  it("운동을 열고 바로 시작한다 (할 말이 없으면 빈 답)", async () => {
    const model = scriptedModel([
      reply([{ tool: "open_exercise", input: { exercise_id: "c-squat", autoplay: true } }]),
      reply([]),
    ]);
    const res = await runUserAgent(ask("스쿼트 할래"), { model, backend: fakeBackend() });
    expect(res).toEqual({ reply: "", actions: [{ type: "OPEN_EXERCISE", exerciseId: "c-squat", autoplay: true }] });
  });

  it("운동 화면이 아니면 재생 조작을 막는다", async () => {
    const model = scriptedModel([
      reply([{ tool: "control_playback", input: { command: "NEXT" } }]),
      reply([{ text: "먼저 운동을 골라 주세요." }]),
    ]);
    const res = await runUserAgent(ask("다음 단계"), { model, backend: fakeBackend() });
    expect(res.actions).toEqual([]);
    expect(toolResults(model.requests[1]!)[0]!.is_error).toBe(true);
  });

  it("위험 신호로 멈추면 같은 말에서 나온 시작 조작은 버린다", async () => {
    const model = scriptedModel([
      reply([
        { tool: "control_playback", input: { command: "STOP" } },
        { tool: "control_playback", input: { command: "START" } },
      ]),
      reply([{ text: "운동을 멈췄어요. 편한 자세로 쉬세요." }]),
    ]);
    const res = await runUserAgent(ask("무릎이 너무 아파"), { model, backend: fakeBackend() });
    expect(res.actions).toEqual([{ type: "PLAYBACK", command: "STOP" }]);
  });

  it("거절되면 정해 둔 말로 답한다", async () => {
    const model = scriptedModel([reply([{ text: "" }], "refusal")]);
    const res = await runUserAgent(ask("..."), { model, backend: fakeBackend() });
    expect(res).toEqual({ reply: REFUSAL_REPLY, actions: [] });
  });

  it("대체 모델이 이어 답했으면 그 앞의 도구 호출은 실행하지 않는다", async () => {
    const model = scriptedModel([
      reply([{ thinking: true }, { tool: "go_to", input: { destination: "HOME" } }, { fallback: true }, { text: "처음 화면이에요." }], "end_turn"),
    ]);
    const res = await runUserAgent(ask("홈"), { model, backend: fakeBackend() });
    expect(res).toEqual({ reply: "처음 화면이에요.", actions: [] });
  });

  it("아무 말도 할 일도 없으면 다시 말해 달라고 한다", async () => {
    const model = scriptedModel([reply([])]);
    const res = await runUserAgent(ask("음"), { model, backend: fakeBackend() });
    expect(res.reply).toBe(NOT_UNDERSTOOD_REPLY);
  });

  it("도구를 끝없이 부르면 정해진 횟수에서 멈춘다", async () => {
    const loop = () => reply([{ tool: "change_speech_rate", input: { direction: "SLOWER" } }]);
    const model = scriptedModel([loop(), loop(), loop(), loop(), loop()]);
    const res = await runUserAgent(ask("천천히"), { model, backend: fakeBackend() });
    expect(model.requests).toHaveLength(5);
    expect(res.actions).toHaveLength(5);
  });
});
