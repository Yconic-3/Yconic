/**
 * 프로젝트에 설치된 PostgreSQL을 켠다 (Docker나 시스템 설치 없이).
 *   pnpm db:start   → 처음이면 데이터 폴더와 개발용 데이터베이스를 만들고 서버를 켠다.
 *                     Ctrl+C를 누르면 서버를 안전하게 끈다.
 * 데이터는 사용자 폴더의 .yconic/pgdata-5433 에 남는다 (YCONIC_PGDATA 환경 변수로 바꿀 수 있다).
 */
import { join } from "node:path";
import { DEV_DB } from "../src/config";
import { startPostgres, YCONIC_HOME } from "../src/server";

const dataDir = process.env.YCONIC_PGDATA ?? join(YCONIC_HOME, `pgdata-${DEV_DB.port}`);

async function main() {
  const server = await startPostgres({ dataDir, port: DEV_DB.port, user: DEV_DB.user, password: DEV_DB.password, database: DEV_DB.database });
  if (server.createdDatabase) console.log(`데이터베이스 "${DEV_DB.database}"를 만들었습니다. 다음으로 pnpm db:setup 을 실행하세요.`);
  console.log(`PostgreSQL이 켜졌습니다 → postgres://${DEV_DB.user}:${DEV_DB.password}@localhost:${DEV_DB.port}/${DEV_DB.database}`);
  console.log("끄려면 Ctrl+C를 누르세요.");

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log("\nPostgreSQL을 끕니다…");
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  server.process.on("exit", (code) => {
    if (!stopping) {
      console.error(`PostgreSQL이 멈췄습니다 (code ${code}).`);
      process.exit(1);
    }
  });
}

main().catch((e) => {
  console.error("PostgreSQL을 켜지 못했습니다:", e instanceof Error ? e.message : e);
  process.exit(1);
});
