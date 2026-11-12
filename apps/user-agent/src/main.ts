import { createClaudeModel } from "@yconic/ai-common";
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
const model = apiKey ? createClaudeModel({ settings: { ...config.ai, apiKey } }) : null;
const server = createAgentServer({ config, model, backend: createHttpBackend(config.apiBaseUrl) });

server.listen(config.port, () => {
  console.log(`[user-agent] http://localhost:${config.port} 에서 실행 중 (운동 정보: ${config.apiBaseUrl})`);
  console.log(
    model
      ? `[user-agent] AI 켜짐: ${config.ai.model}, 생각 깊이 ${config.ai.effort}`
      : "[user-agent] AI 꺼짐: ANTHROPIC_API_KEY가 없어 웹앱은 규칙 기반 해석을 씁니다.",
  );
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
