import {
  echoableContent,
  textOf,
  toolUsesOf,
  type AiModel,
  type ClaudeMessageParam,
  type ClaudeToolResultBlockParam,
} from "@yconic/ai-common";
import type { AgentAction, AgentChatRequest, AgentChatResponse } from "@yconic/shared-types";
import type { Backend } from "./backend";
import { appStateText, USER_AGENT_SYSTEM_PROMPT } from "./prompt";
import { runTool, sayOf, SCREEN_TOOLS, USER_AGENT_TOOLS } from "./tools";

/** 한 번의 말에 Claude를 부르는 최대 횟수 (도구 → 답) */
const MAX_STEPS = 5;
/** 답 한 번의 최대 길이. 생각도 이 안에 들어간다 */
const MAX_TOKENS = 4096;
/** 소리로 읽기에 너무 긴 답은 자른다 */
const REPLY_CHARS = 600;

export const NOT_UNDERSTOOD_REPLY = "잘 알아듣지 못했어요. 다시 한 번 말씀해 주세요.";
export const REFUSAL_REPLY = "그 요청은 도와드리기 어려워요. 운동 찾기나 운동 안내에 대해 말씀해 주세요.";
export const GAVE_UP_REPLY = "요청을 끝까지 처리하지 못했어요. 조금 더 짧게 말씀해 주세요.";

export interface UserAgentDeps {
  model: AiModel;
  backend: Backend;
  /**
   * 화면 도구만 부른 차례에서 도구에 함께 온 말(say)을 답으로 삼고 Claude를 다시 부르지 않을지 (기본: 그렇게 한다).
   * false면 예전처럼 도구 결과를 돌려주고 한 번 더 불러 답을 받는다 (비교하거나 되돌릴 때).
   */
  singleCall?: boolean;
}

/** 앞선 대화를 Claude 메시지로 바꾼다. 첫 메시지는 사용자 말이어야 해서 앞쪽의 비서 말은 뺀다 */
function historyMessages(history: AgentChatRequest["history"]): ClaudeMessageParam[] {
  const start = history.findIndex((t) => t.role === "user");
  if (start < 0) return [];
  return history.slice(start).map((t) => ({ role: t.role, content: t.text }));
}

function clip(text: string): string {
  return text.length > REPLY_CHARS ? `${text.slice(0, REPLY_CHARS - 1)}…` : text;
}

/** STOP이 있으면 같은 말에서 나온 재생 시작류 조작은 버린다 (안전이 먼저) */
function safeActions(actions: AgentAction[]): AgentAction[] {
  if (!actions.some((a) => a.type === "PLAYBACK" && a.command === "STOP")) return actions;
  return actions.filter((a) => a.type !== "OPEN_EXERCISE" && !(a.type === "PLAYBACK" && a.command !== "STOP"));
}

/** 답을 만드는 동안 중간에 알리는 것 (POST /chat/stream). 없으면 끝난 뒤에 한 번에 돌려준다 */
export interface UserAgentHooks {
  /** 답의 다음 글자들 */
  onText?(delta: string): void;
  /** 지금까지 준 글을 버린다 (도구를 부르기 전의 말이었거나, 다시 답하기 시작했다) */
  onReset?(): void;
  /** 지금까지 정해진 할 일 (도구를 실행한 뒤, 다음 답을 받기 전에) */
  onActions?(actions: AgentAction[]): void;
}

/** 여러 화면 도구가 함께 왔을 때 읽을 말: 멈춤(STOP)의 말이 먼저, 아니면 마지막 도구의 말 */
function replyFromScreenTools(uses: { name: string; input: unknown }[]): string {
  const stop = uses.find((u) => u.name === "control_playback" && (u.input as { command?: unknown } | null)?.command === "STOP");
  if (stop && sayOf(stop.input)) return sayOf(stop.input);
  for (let i = uses.length - 1; i >= 0; i--) {
    const say = sayOf(uses[i]!.input);
    if (say) return say;
  }
  return "";
}

/**
 * 사용자의 말 한 마디를 처리한다.
 * Claude가 도구를 부르면 실행해 결과를 돌려주고, 도구를 더 부르지 않을 때의 말을 답으로 삼는다.
 * 화면 도구(열기·재생·속도·이동)만 부른 차례는 거기서 끝낸다: 도구에 함께 온 말이 답이다.
 * 결과를 보고 다시 생각할 것이 없는데 한 번 더 부르면 그만큼 사람이 기다린다 (docs/decisions/0019).
 */
export async function runUserAgent(request: AgentChatRequest, deps: UserAgentDeps, hooks: UserAgentHooks = {}): Promise<AgentChatResponse> {
  const exercises = await deps.backend.listExercises();
  const actions: AgentAction[] = [];
  const messages: ClaudeMessageParam[] = [
    ...historyMessages(request.history),
    {
      role: "user",
      content: [
        { type: "text", text: appStateText(request.context, exercises) },
        { type: "text", text: request.message },
      ],
    },
  ];

  let lastText = "";
  // 글자가 나오는 대로 알린다. 답은 REPLY_CHARS에서 자르므로 그 뒤의 글은 알리지 않는다
  let sent = 0;
  const reset = () => {
    if (sent > 0) hooks.onReset?.();
    sent = 0;
  };
  const streaming = hooks.onText
    ? {
        onText: (delta: string) => {
          const room = REPLY_CHARS - 1 - sent;
          if (room <= 0) return;
          const piece = delta.slice(0, room);
          sent += piece.length;
          hooks.onText!(piece);
        },
        onRestart: reset,
      }
    : undefined;

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await deps.model.run(
      {
        system: USER_AGENT_SYSTEM_PROMPT,
        tools: USER_AGENT_TOOLS,
        messages,
        max_tokens: MAX_TOKENS,
      },
      streaming,
    );

    // 대체 모델까지 모두 거절했다. 이미 한 조작 중 멈춤만 남긴다
    if (response.stop_reason === "refusal") {
      reset();
      return { reply: REFUSAL_REPLY, actions: safeActions(actions).filter((a) => a.type === "PLAYBACK" && a.command === "STOP") };
    }

    const content = echoableContent(response.content);
    const text = textOf(content);
    if (text) lastText = text;
    const toolUses = toolUsesOf(content);

    if (toolUses.length === 0 || response.stop_reason !== "tool_use") {
      const reply = text || (actions.length ? "" : NOT_UNDERSTOOD_REPLY);
      return { reply: clip(reply), actions: safeActions(actions) };
    }

    // 도구를 부르는 차례에 나온 글은 답이 아니다 (화면이 읽기 시작했다면 버리게 한다)
    reset();
    messages.push({ role: "assistant", content });
    const results: ClaudeToolResultBlockParam[] = [];
    let failed = false;
    for (const use of toolUses) {
      const outcome = await runTool(use.name, use.input, { backend: deps.backend, context: request.context, actions });
      if (outcome.isError) failed = true;
      results.push({ type: "tool_result", tool_use_id: use.id, content: outcome.content, is_error: outcome.isError });
    }
    // 화면 도구만 불렀고 모두 됐으면, 함께 온 말을 답으로 삼고 끝낸다.
    // 정보 도구가 섞였거나(결과를 보고 답해야 한다) 실패했으면(다르게 말해야 한다) 한 번 더 부른다.
    if (deps.singleCall !== false && !failed && toolUses.every((u) => SCREEN_TOOLS.has(u.name))) {
      const say = replyFromScreenTools(toolUses);
      if (say) return { reply: clip(say), actions: safeActions(actions) };
    }
    // 할 일이 있으면 답을 받기 전에 알린다. 화면은 할 일이 있을 때는 먼저 읽지 않는다 (읽는 중에 화면이 바뀌지 않게)
    if (actions.length > 0) hooks.onActions?.(safeActions(actions));
    messages.push({ role: "user", content: results });
  }

  return { reply: clip(lastText || (actions.length ? "" : GAVE_UP_REPLY)), actions: safeActions(actions) };
}
