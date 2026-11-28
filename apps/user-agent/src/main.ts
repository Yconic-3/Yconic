import { createClaudeModel, limitFromEnv, withDailyLimit } from "@yconic/ai-common";
import { createHttpBackend } from "./backend";
import { loadConfig } from "./config";
import { createAgentServer } from "./server";

// apps/user-agent/.env 가 있으면 읽는다 (.env.example 참고)
try {
  process.loadEnvFile(".env");
} catch {
  // 없으면 기본값을 쓴다
}

const config = loadConfig();
const { apiKey } = config.ai;
// 하루 사용 한도 (공개 링크로 열어 둘 때). 넘으면 웹앱이 규칙 기반 해석으로 돌아간다
const dailyLimit = limitFromEnv(process.env.AI_DAILY_LIMIT);
const model = apiKey ? withDailyLimit(createClaudeModel({ settings: { ...config.ai, apiKey } }), dailyLimit, "대화") : null;
const server = createAgentServer({ config, model, backend: createHttpBackend(config.apiBaseUrl) });

server.listen(config.port, () => {
  console.log(`[user-agent] http://localhost:${config.port} 에서 실행 중 (운동 정보: ${config.apiBaseUrl})`);
  console.log(
    model
      ? `[user-agent] AI 켜짐: ${config.ai.model}, 생각 깊이 ${config.ai.effort}`
      : "[user-agent] AI 꺼짐: ANTHROPIC_API_KEY가 없어 웹앱은 규칙 기반 해석을 씁니다.",
  );
  if (model && dailyLimit) console.log(`[user-agent] 하루 AI 한도: ${dailyLimit}번`);
  if (model) console.log(`[user-agent] 조작 명령: ${config.singleCall ? "Claude 한 번으로 답함" : "도구 결과를 보고 한 번 더 부름 (AGENT_SINGLE_CALL=off)"}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
