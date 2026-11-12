import {
  AGENT_LIMITS,
  AGENT_SCREENS,
  EXERCISE_SESSION_STATES,
  type AgentAppContext,
  type AgentChatRequest,
  type AgentTurn,
} from "@yconic/shared-types";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseContext(v: unknown): AgentAppContext {
  if (!isObject(v)) throw new ValidationError("context가 필요합니다.");
  const screen = AGENT_SCREENS.find((s) => s === v.screen);
  if (!screen) throw new ValidationError("context.screen이 올바르지 않습니다.");
  const exerciseId = typeof v.exerciseId === "string" && v.exerciseId.length <= 100 ? v.exerciseId : null;
  const sessionState = EXERCISE_SESSION_STATES.find((s) => s === v.sessionState) ?? null;
  const segmentIndex =
    typeof v.segmentIndex === "number" && Number.isInteger(v.segmentIndex) && v.segmentIndex >= 0 ? v.segmentIndex : null;
  return { screen, exerciseId, sessionState, segmentIndex };
}

function parseHistory(v: unknown): AgentTurn[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new ValidationError("history는 배열이어야 합니다.");
  return v.slice(-AGENT_LIMITS.historyTurns).flatMap((t): AgentTurn[] => {
    if (!isObject(t) || (t.role !== "user" && t.role !== "assistant") || typeof t.text !== "string") {
      throw new ValidationError("history 항목은 { role, text } 모양이어야 합니다.");
    }
    const text = t.text.trim().slice(0, AGENT_LIMITS.turnChars);
    return text ? [{ role: t.role, text }] : [];
  });
}

/** POST /chat 요청 본문을 검사한다 */
export function parseChatRequest(body: unknown): AgentChatRequest {
  if (!isObject(body)) throw new ValidationError("요청 본문이 올바르지 않습니다.");
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) throw new ValidationError("message가 필요합니다.");
  if (message.length > AGENT_LIMITS.messageChars) {
    throw new ValidationError(`message는 ${AGENT_LIMITS.messageChars}자 이하여야 합니다.`);
  }
  return { message, history: parseHistory(body.history), context: parseContext(body.context) };
}
