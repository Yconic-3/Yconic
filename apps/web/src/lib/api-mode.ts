/**
 * 데이터를 어디서 가져올지 정한다. 사용자 화면과 관리자 화면이 같은 값을 쓴다.
 * - http (기본): 백엔드 API(apps/api)를 쓴다. `pnpm db:start` 와 `pnpm dev:api` 가 켜져 있어야 한다.
 * - mock: 서버 없이 브라우저 저장소의 모의 데이터를 쓴다 (화면만 빨리 볼 때).
 */
export type ApiMode = "mock" | "http";

export function getApiMode(): ApiMode {
  return process.env.NEXT_PUBLIC_API_MODE === "mock" ? "mock" : "http";
}

/** 백엔드 주소 (http 모드) */
export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/+$/, "");
}

/** 사용자 AI 에이전트 주소 (http 모드). 꺼져 있으면 화면이 규칙 기반 해석을 쓴다 */
export function agentBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:4100").replace(/\/+$/, "");
}

/** 서버에 연결하지 못했을 때 보여 줄 말 */
export const API_UNREACHABLE_MESSAGE = "서버에 연결할 수 없습니다. API 서버(pnpm dev:api)가 켜져 있는지 확인해 주세요.";
