import { aiSettingsFromEnv, type AiSettings } from "@yconic/ai-common";

export interface AgentConfig {
  port: number;
  /** 운동 정보를 가져올 백엔드 API 주소 */
  apiBaseUrl: string;
  /** 이 주소에서 오는 브라우저 요청만 받는다 (CORS) */
  webOrigins: string[];
  ai: AiSettings;
  /** 한 IP가 1분에 보낼 수 있는 대화 요청 수 */
  rateLimitPerMinute: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  return {
    port: Number(env.AGENT_PORT ?? 4100),
    apiBaseUrl: (env.API_BASE_URL ?? "http://localhost:4000").replace(/\/+$/, ""),
    webOrigins: (env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((s) => s.trim()),
    ai: aiSettingsFromEnv(env),
    rateLimitPerMinute: Number(env.AGENT_RATE_LIMIT ?? 30),
  };
}
