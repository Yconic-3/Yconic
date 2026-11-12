import "reflect-metadata";
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
const app = await createApp({ config, db });

try {
  await app.listen(config.port);
} catch (e) {
  await close();
  throw e;
}

console.log(`[api] http://localhost:${config.port} 에서 실행 중 (DB: ${databaseUrl().replace(/:[^:@/]+@/, ":***@")})`);
console.log(`[api] 웹앱 주소 허용: ${config.webOrigins.join(", ")}`);

const shutdown = async () => {
  await app.close();
  await close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
