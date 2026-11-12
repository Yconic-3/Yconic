import type { Id } from "./common";
import type { ExerciseCategory, ExerciseSessionState } from "./exercise";

/**
 * 사용자 AI 에이전트(apps/user-agent) 요청·응답 형식. 사용자 화면(apps/web/src/user)과 에이전트가 이 형식으로 주고받는다.
 *   GET  /health  → AgentHealth
 *   POST /chat    AgentChatRequest → AgentChatResponse
 * 오류는 { code: AgentErrorCode, message } 모양이다.
 *
 * 에이전트는 화면을 직접 바꾸지 않는다. 할 일(AgentAction)을 돌려주면 화면이 실행한다.
 * 운동 정보는 공개 중인 콘텐츠에서만 가져온다 (설계 문서 3장 지식 접근 정책).
 */

export const AGENT_PLAYBACK_COMMANDS = ["START", "PAUSE", "NEXT", "PREVIOUS", "REPEAT", "STOP"] as const;
/** START 시작·이어서, PAUSE 멈춤, NEXT 다음 단계, PREVIOUS 이전 단계, REPEAT 안내 다시, STOP 운동 중단(위험 신호) */
export type AgentPlaybackCommand = (typeof AGENT_PLAYBACK_COMMANDS)[number];

export type AgentAction =
  /** 처음 화면에서 운동 목록을 거른다 (분류·낱말이 null이면 전체) */
  | { type: "SHOW_LIST"; category: ExerciseCategory | null; keyword: string | null }
  /** 운동 화면을 연다. autoplay면 바로 안내를 시작한다 */
  | { type: "OPEN_EXERCISE"; exerciseId: Id; autoplay: boolean }
  | { type: "PLAYBACK"; command: AgentPlaybackCommand }
  | { type: "SPEECH_RATE"; direction: "SLOWER" | "FASTER" }
  | { type: "NAVIGATE"; destination: "HOME" | "BACK" };

/** 앞선 대화 한 마디. 화면에 남은 말을 그대로 보낸다 */
export interface AgentTurn {
  role: "user" | "assistant";
  text: string;
}

export const AGENT_SCREENS = ["home", "list", "exercise"] as const;
export type AgentScreen = (typeof AGENT_SCREENS)[number];

/** 사용자가 지금 보고 있는 화면. 에이전트는 이것을 참고 자료로만 쓴다 */
export interface AgentAppContext {
  screen: AgentScreen;
  /** 운동 화면이면 그 운동 */
  exerciseId: Id | null;
  sessionState: ExerciseSessionState | null;
  /** 지금 단계 (0부터) */
  segmentIndex: number | null;
}

export interface AgentChatRequest {
  /** 사용자가 방금 한 말 */
  message: string;
  history: AgentTurn[];
  context: AgentAppContext;
}

export interface AgentChatResponse {
  /** 사용자에게 읽어 줄 말. 할 일만 있고 할 말이 없으면 빈 문자열 */
  reply: string;
  actions: AgentAction[];
}

export interface AgentHealth {
  ok: true;
  /** AI가 켜져 있는지 (API 키가 있는지). false면 화면이 규칙 기반 해석으로 돌아간다 */
  ai: boolean;
}

export type AgentErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  /** API 키가 없어 AI가 꺼져 있다 */
  | "AI_DISABLED"
  /** AI 서비스가 바쁘거나 연결이 안 된다. 잠시 뒤 다시 */
  | "AI_BUSY"
  | "AI_FAILED"
  /** 운동 정보를 가져올 백엔드 API에 연결하지 못했다 */
  | "BACKEND_UNAVAILABLE"
  | "UNKNOWN";

/** 요청 크기 제한 */
export const AGENT_LIMITS = {
  messageChars: 500,
  historyTurns: 10,
  turnChars: 1000,
} as const;
