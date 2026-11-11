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
import { runTool, USER_AGENT_TOOLS } from "./tools";

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

/**
 * 사용자의 말 한 마디를 처리한다.
 * Claude가 도구를 부르면 실행해 결과를 돌려주고, 도구를 더 부르지 않을 때의 말을 답으로 삼는다.
 */
export async function runUserAgent(request: AgentChatRequest, deps: UserAgentDeps): Promise<AgentChatResponse> {
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
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await deps.model.run({
      system: USER_AGENT_SYSTEM_PROMPT,
      tools: USER_AGENT_TOOLS,
      messages,
      max_tokens: MAX_TOKENS,
    });

    // 대체 모델까지 모두 거절했다. 이미 한 조작 중 멈춤만 남긴다
    if (response.stop_reason === "refusal") {
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

    messages.push({ role: "assistant", content });
    const results: ClaudeToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const outcome = await runTool(use.name, use.input, { backend: deps.backend, context: request.context, actions });
      results.push({ type: "tool_result", tool_use_id: use.id, content: outcome.content, is_error: outcome.isError });
    }
    messages.push({ role: "user", content: results });
  }

  return { reply: clip(lastText || (actions.length ? "" : GAVE_UP_REPLY)), actions: safeActions(actions) };
}
