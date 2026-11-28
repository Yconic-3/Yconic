import type { AgentAction, AgentChatRequest, AgentChatResponse, AgentHealth, AgentStreamEvent } from "@yconic/shared-types";
import { agentBaseUrl, getApiMode } from "@/lib/api-mode";
import type { Intent } from "./intent";

/**
 * 사용자 AI 에이전트(apps/user-agent)에 말을 보낸다.
 * 에이전트가 꺼져 있거나(API 키 없음, 서버 안 켬) 답하지 못하면 null을 돌려준다.
 * 그러면 화면은 규칙 기반 해석(intent.ts)으로 처리한다. 그래서 에이전트가 없어도 앱은 그대로 쓸 수 있다.
 */
export interface AgentClient {
  chat(request: AgentChatRequest): Promise<AgentChatResponse | null>;
  /**
   * chat과 같지만, 답의 글자가 나오는 대로 알려 준다 (docs/decisions/0020). 끝나면 완성된 답을 돌려준다.
   * 에이전트가 스트림을 모르면(예전 서버, 웹앱 안 에이전트) chat으로 받는다. 그때는 중간 알림이 없다.
   */
  chatStream(request: AgentChatRequest, handlers: AgentStreamHandlers): Promise<AgentChatResponse | null>;
}

export interface AgentStreamHandlers {
  /** 답의 다음 글자들 */
  onText?(delta: string): void;
  /** 지금까지 받은 글을 버린다 */
  onReset?(): void;
  /** 지금까지 정해진 할 일 */
  onActions?(actions: AgentAction[]): void;
}

/** 에이전트를 못 쓸 때 다시 확인하기까지 기다리는 시간 */
const RETRY_AFTER_MS = 30_000;
const HEALTH_TIMEOUT_MS = 3_000;
/**
 * 대답은 보통 3~6초면 온다. 이보다 오래 걸리면 기다리게 하지 않고 규칙 기반 해석으로 넘긴다
 * (예전에는 25초까지 기다려서, AI가 느릴 때 화면이 '답을 생각하고 있어요'에 멈춘 것처럼 보였다).
 */
export const CHAT_TIMEOUT_MS = 12_000;
/** 글자가 나오는 대로 받을 때: 첫 소식까지는 CHAT_TIMEOUT_MS, 전체는 이만큼까지 기다린다 */
export const STREAM_TOTAL_TIMEOUT_MS = 30_000;

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

  // 이 에이전트가 /chat/stream을 아는지. 모른다고 답하면(404) 그 뒤로는 /chat만 쓴다
  let streamSupported = true;

  /** 답하지 못한 응답: 키가 빠졌으면 한동안 묻지 않는다. 바쁨·요청 수 초과 같은 일시적인 오류는 이번 말만 규칙으로 처리한다 */
  async function failed(res: Response): Promise<null> {
    const error = (await res.json().catch(() => null)) as { code?: string } | null;
    if (error?.code === "AI_DISABLED") state = now() + RETRY_AFTER_MS;
    return null;
  }

  async function chat(request: AgentChatRequest): Promise<AgentChatResponse | null> {
    if (!(await available())) return null;
    try {
      const res = await fetchFn(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      });
      if (res.ok) return (await res.json()) as AgentChatResponse;
      return failed(res);
    } catch {
      // 연결이 끊겼다. 서버가 꺼졌을 수 있으니 한동안 묻지 않는다
      state = now() + RETRY_AFTER_MS;
      return null;
    }
  }

  async function chatStream(request: AgentChatRequest, handlers: AgentStreamHandlers): Promise<AgentChatResponse | null> {
    if (!streamSupported) return chat(request);
    if (!(await available())) return null;
    const abort = new AbortController();
    // 첫 소식이 늦으면 그만둔다. 소식이 오기 시작하면 전체 시간만 본다
    let firstTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => abort.abort(), CHAT_TIMEOUT_MS);
    const totalTimer = setTimeout(() => abort.abort(), STREAM_TOTAL_TIMEOUT_MS);
    const gotNews = () => {
      if (firstTimer) clearTimeout(firstTimer);
      firstTimer = null;
    };
    try {
      const res = await fetchFn(`${baseUrl}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: abort.signal,
      });
      if (res.status === 404 || res.status === 405) {
        streamSupported = false;
        return chat(request);
      }
      if (!res.ok) return failed(res);
      // 스트림이 아니라 통째로 온 답이면 그대로 쓴다
      if (!res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) return (await res.json()) as AgentChatResponse;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: AgentChatResponse | null = null;
      const handle = (line: string) => {
        if (!line.trim()) return;
        gotNews();
        const event = JSON.parse(line) as AgentStreamEvent;
        if (event.type === "text") handlers.onText?.(event.delta);
        else if (event.type === "reset") handlers.onReset?.();
        else if (event.type === "actions") handlers.onActions?.(event.actions);
        else if (event.type === "done") result = event.response;
        else if (event.type === "error" && event.code === "AI_DISABLED") state = now() + RETRY_AFTER_MS;
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n")) >= 0) {
          handle(buffer.slice(0, cut));
          buffer = buffer.slice(cut + 1);
        }
      }
      handle(buffer);
      // 끝(done)을 받지 못하고 끊겼으면 답이 없는 것으로 본다
      return result;
    } catch {
      // 연결이 끊겼거나 너무 오래 걸렸다. 서버가 꺼졌을 수 있으니 한동안 묻지 않는다
      state = now() + RETRY_AFTER_MS;
      return null;
    } finally {
      gotNews();
      clearTimeout(totalTimer);
    }
  }

  return { chat, chatStream };
}

const OFF: AgentClient = { chat: async () => null, chatStream: async () => null };

/** 환경에 맞는 에이전트 연결. 모의 모드(서버 없이 화면만 볼 때)에서는 쓰지 않는다 */
export function createDefaultAgentClient(): AgentClient {
  // 예시 데이터 모드라도 에이전트 주소를 정해 두면(Vercel: /agent) 그 에이전트를 쓴다
  return getApiMode() === "http" || process.env.NEXT_PUBLIC_AGENT_URL ? createAgentClient(agentBaseUrl()) : OFF;
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
  "VIDEOS",
  "SETTINGS",
  "HELP",
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
