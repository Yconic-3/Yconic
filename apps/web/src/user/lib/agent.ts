import type { AgentAction, AgentChatRequest, AgentChatResponse, AgentHealth } from "@yconic/shared-types";
import { agentBaseUrl, getApiMode } from "@/lib/api-mode";
import type { Intent } from "./intent";

/**
 * 사용자 AI 에이전트(apps/user-agent)에 말을 보낸다.
 * 에이전트가 꺼져 있거나(API 키 없음, 서버 안 켬) 답하지 못하면 null을 돌려준다.
 * 그러면 화면은 규칙 기반 해석(intent.ts)으로 처리한다. 그래서 에이전트가 없어도 앱은 그대로 쓸 수 있다.
 */
export interface AgentClient {
  chat(request: AgentChatRequest): Promise<AgentChatResponse | null>;
}

/** 에이전트를 못 쓸 때 다시 확인하기까지 기다리는 시간 */
const RETRY_AFTER_MS = 30_000;
const HEALTH_TIMEOUT_MS = 3_000;
/** 에이전트는 Claude를 여러 번 부를 수 있어 넉넉히 기다린다 */
const CHAT_TIMEOUT_MS = 25_000;

export function createAgentClient(baseUrl: string, fetchFn: typeof fetch = (...args) => fetch(...args), now = () => Date.now()): AgentClient {
  // null: 아직 모름, true: 쓸 수 있음, 숫자: 이 시각까지 쓰지 않음
  let state: boolean | number | null = null;

  async function available(): Promise<boolean> {
    if (state === true) return true;
    if (typeof state === "number" && now() < state) return false;
    try {
      const res = await fetchFn(`${baseUrl}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
      const health = res.ok ? ((await res.json()) as AgentHealth) : null;
      state = health?.ai === true ? true : now() + RETRY_AFTER_MS;
    } catch {
      state = now() + RETRY_AFTER_MS;
    }
    return state === true;
  }

  return {
    async chat(request) {
      if (!(await available())) return null;
      try {
        const res = await fetchFn(`${baseUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
        });
        if (res.ok) return (await res.json()) as AgentChatResponse;
        // 키가 빠졌으면 한동안 묻지 않는다. 바쁨·요청 수 초과 같은 일시적인 오류는 이번 말만 규칙으로 처리한다
        const error = (await res.json().catch(() => null)) as { code?: string } | null;
        if (error?.code === "AI_DISABLED") state = now() + RETRY_AFTER_MS;
        return null;
      } catch {
        // 연결이 끊겼다. 서버가 꺼졌을 수 있으니 한동안 묻지 않는다
        state = now() + RETRY_AFTER_MS;
        return null;
      }
    },
  };
}

const OFF: AgentClient = { chat: async () => null };

/** 환경에 맞는 에이전트 연결. 모의 모드(서버 없이 화면만 볼 때)에서는 쓰지 않는다 */
export function createDefaultAgentClient(): AgentClient {
  return getApiMode() === "http" ? createAgentClient(agentBaseUrl()) : OFF;
}

/** 계정·음성 설정·화면 종류처럼 앱 자체를 다루는 말. 길이와 상관없이 화면이 바로 처리한다 */
const APP_COMMANDS = new Set<Intent["type"]>([
  "MIC",
  "WAKE_ON",
  "WAKE_OFF",
  "ACCOUNT",
  "LOGOUT",
  "TTS_ON",
  "TTS_OFF",
  "TTS_PAUSE",
  "TTS_RESUME",
  "CONSUME",
  "SUPPLY",
  "NEW_CONTENT",
  "COURSES",
  "MOVEMENT",
]);

/** 어느 화면에서나 바로 처리할 짧은 조작 */
const QUICK_ANYWHERE = new Set<Intent["type"]>(["SLOWER", "FASTER", "HOME", "BACK"]);
/** 운동 화면에서만 바로 처리할 짧은 조작. 다른 화면의 "그거 할래"는 앞 대화를 알아야 해서 에이전트가 맡는다 */
const QUICK_ON_EXERCISE = new Set<Intent["type"]>(["START", "PAUSE", "NEXT", "PREVIOUS", "REPEAT"]);
const QUICK_MAX_CHARS = 8;

/**
 * 에이전트를 거치지 않고 화면에서 바로 처리할 말인지.
 * - 위험 신호(통증·어지럼 등)는 늘 바로 멈춘다. 네트워크를 기다리지 않는다 (설계 문서 10장)
 * - 운동 중 "다음", "멈춰"처럼 짧은 조작은 운동 흐름이 끊기지 않게 바로 처리한다
 * 나머지(찾기, 질문, 긴 말)는 에이전트가 맡는다.
 */
export function handleLocally(intent: Intent, text: string, onExercise: boolean): boolean {
  if (intent.type === "SAFETY" || APP_COMMANDS.has(intent.type)) return true;
  if (text.replace(/\s+/g, "").length > QUICK_MAX_CHARS) return false;
  return QUICK_ANYWHERE.has(intent.type) || (onExercise && QUICK_ON_EXERCISE.has(intent.type));
}

/**
 * 에이전트가 돌려준 할 일을 답을 읽기 전과 뒤로 나눈다.
 * 단계 안내를 읽기 시작하는 조작(시작·다음·이전·다시, 바로 시작하는 운동 열기)은 답을 다 읽은 뒤에 해야
 * 안내가 답을 끊지 않는다. 나머지(화면 이동, 멈춤, 속도)는 바로 한다.
 */
export function splitAgentActions(actions: AgentAction[]): { before: AgentAction[]; after: AgentAction[] } {
  const startsGuidance = (a: AgentAction) =>
    (a.type === "PLAYBACK" && a.command !== "PAUSE" && a.command !== "STOP") || (a.type === "OPEN_EXERCISE" && a.autoplay);
  return { before: actions.filter((a) => !startsGuidance(a)), after: actions.filter(startsGuidance) };
}
