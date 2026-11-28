import "reflect-metadata";
import { aiSettingsFromEnv, createClaudeModel, limitFromEnv, withDailyLimit } from "@yconic/ai-common";
import { createMockAnalyzer } from "@yconic/content-analysis";
import { createClaudeVideoAnalyzer, createLocalMediaTools } from "@yconic/content-analysis/claude";
import { connectDatabase, databaseUrl } from "@yconic/database";
import { sql } from "drizzle-orm";
import { loadConfig } from "./config";
import { createApp } from "./create-app";

// apps/api/.env 가 있으면 읽는다 (.env.example 참고)
try {
  process.loadEnvFile(".env");
} catch {
  // 없으면 기본값을 쓴다
}

const config = loadConfig();
const { db, close } = connectDatabase();

// pnpm dev로 DB와 함께 켜면 DB가 조금 늦게 뜬다. 연결될 때까지 최대 1분 기다린다.
for (let attempt = 1; ; attempt++) {
  try {
    await db.execute(sql`select 1`);
    break;
  } catch (e) {
    if (attempt >= 60) {
      console.error("[api] 데이터베이스에 연결하지 못했습니다. pnpm db:start 로 DB를 켰는지 확인하세요.");
      await close();
      throw e;
    }
    if (attempt === 1) console.log("[api] 데이터베이스가 켜지기를 기다리는 중…");
    await new Promise((r) => setTimeout(r, 1000));
  }
}
// Claude: API 키가 있으면 실제 영상 분석기(장면 + 강사의 말 받아쓰기)와 AI 맞춤 안내를 쓴다 (docs/decisions/0008)
const aiSettings = aiSettingsFromEnv();
const ai = aiSettings.apiKey ? createClaudeModel({ settings: { ...aiSettings, apiKey: aiSettings.apiKey } }) : null;
const useClaudeAnalyzer = !!ai && (process.env.VIDEO_ANALYZER ?? "claude") === "claude";
// 하루 사용 한도 (공개 링크로 열어 둘 때). 영상 분석과 맞춤 안내를 따로 센다
const analysisLimit = limitFromEnv(process.env.AI_DAILY_LIMIT_ANALYSIS);
const guidesLimit = limitFromEnv(process.env.AI_DAILY_LIMIT_GUIDES);
const analyzer = useClaudeAnalyzer
  ? createClaudeVideoAnalyzer({
      model: withDailyLimit(ai, analysisLimit, "영상 분석"),
      media: createLocalMediaTools({ ffmpeg: process.env.FFMPEG, python: process.env.PYTHON, whisperModel: process.env.WHISPER_MODEL }),
    })
  : createMockAnalyzer();
const app = await createApp({ config, db, analyzer, ai: ai && withDailyLimit(ai, guidesLimit, "맞춤 안내") });

try {
  await app.listen(config.port);
} catch (e) {
  await close();
  throw e;
}

console.log(`[api] http://localhost:${config.port} 에서 실행 중 (DB: ${databaseUrl().replace(/:[^:@/]+@/, ":***@")})`);
console.log(`[api] 웹앱 주소 허용: ${config.webOrigins.join(", ")}`);
console.log(
  useClaudeAnalyzer
    ? `[api] 영상 분석: Claude(${aiSettings.model}) + 장면 추출(ffmpeg) + 받아쓰기(faster-whisper)`
    : "[api] 영상 분석: 모의 분석기 (ANTHROPIC_API_KEY가 없거나 VIDEO_ANALYZER=mock)",
);
console.log(ai ? "[api] 맞춤 안내: AI가 사용자별로 다시 씀" : "[api] 맞춤 안내: 규칙으로 고름 (API 키 없음)");
console.log(`[api] 로그인: 이메일 가입 ${config.signup ? "받음" : "안 받음"}, 구글 로그인 ${config.googleClientId ? "켜짐" : "꺼짐 (GOOGLE_CLIENT_ID 없음)"}, 체험 계정 ${config.demoAccounts ? "보임" : "숨김"}, 관리자 이메일 ${config.superAdminEmails.length}개`);
if (config.publicLinkAdminLogin) console.log("[api] 주의: 공개 링크에서도 관리자 계정으로 로그인할 수 있습니다 (PUBLIC_LINK_ADMIN_LOGIN=allow)");
if (ai && (analysisLimit || guidesLimit)) {
  console.log(`[api] 하루 AI 한도: 영상 분석 ${analysisLimit ?? "제한 없음"}번, 맞춤 안내 ${guidesLimit ?? "제한 없음"}번`);
}

const shutdown = async () => {
  await app.close();
  await close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
