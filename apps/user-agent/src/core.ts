/**
 * 사용자 에이전트의 핵심만 밖에 내보낸다 (docs/decisions/0012).
 * 이 앱(apps/user-agent)은 보통 4100번 서버로 돌지만, 서버를 따로 둘 수 없는 곳(Vercel)에서는
 * 웹앱(apps/web)의 서버 함수가 이 핵심을 그대로 불러 쓴다. 판단 규칙은 한 곳에만 있다.
 */
export { GAVE_UP_REPLY, NOT_UNDERSTOOD_REPLY, REFUSAL_REPLY, runUserAgent, type UserAgentDeps, type UserAgentHooks } from "./agent";
export { BackendUnavailableError, type Backend } from "./backend";
export { parseChatRequest, ValidationError } from "./validate";
