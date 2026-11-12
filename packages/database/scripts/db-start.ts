/**
 * 프로젝트에 설치된 PostgreSQL을 켠다 (Docker나 시스템 설치 없이).
 *   pnpm db:start   → 처음이면 데이터 폴더와 개발용 데이터베이스를 만들고 서버를 켠다.
 *                     Ctrl+C를 누르면 서버를 안전하게 끈다.
 *   pnpm dev        → DB·API·AI 에이전트·웹앱을 한 번에 켤 때도 이 스크립트가 돈다.
 * 이미 다른 창에서 켜 두었으면 그대로 쓰고 새로 켜지 않는다.
 * 켤 때마다 아직 반영하지 않은 테이블 변경(마이그레이션)을 반영하고, 처음 만든 DB에는 예시 데이터를 넣는다.
 * 그래서 git pull 뒤에 pnpm db:migrate 를 따로 하지 않아도 된다.
 * 데이터는 사용자 폴더의 .yconic/pgdata-5433 에 남는다 (YCONIC_PGDATA 환경 변수로 바꿀 수 있다).
 */
import { createConnection } from "node:net";
import { join } from "node:path";
import { databaseUrl, DEV_DB } from "../src/config";
import { connectDatabase } from "../src/index";
import { runMigrations } from "../src/migrate";
import { seedDatabase } from "../src/seed";
import { startPostgres, YCONIC_HOME } from "../src/server";

const dataDir = process.env.YCONIC_PGDATA ?? join(YCONIC_HOME, `pgdata-${DEV_DB.port}`);

/** 이 포트에 이미 무언가 켜져 있는지 */
function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function main() {
  if (await portInUse(DEV_DB.port)) {
    console.log(`PostgreSQL이 이미 켜져 있습니다 (포트 ${DEV_DB.port}). 그대로 씁니다.`);
    await runMigrations(databaseUrl()).catch((e) => console.error("테이블을 맞추지 못했습니다:", e instanceof Error ? e.message : e));
    return;
  }
  const server = await startPostgres({ dataDir, port: DEV_DB.port, user: DEV_DB.user, password: DEV_DB.password, database: DEV_DB.database });
  console.log(`PostgreSQL이 켜졌습니다 → postgres://${DEV_DB.user}:${DEV_DB.password}@localhost:${DEV_DB.port}/${DEV_DB.database}`);
  try {
    const url = databaseUrl();
    await runMigrations(url);
    console.log("테이블을 최신으로 맞췄습니다 (마이그레이션).");
    if (server.createdDatabase) {
      const { db, close } = connectDatabase(url);
      try {
        await seedDatabase(db);
      } finally {
        await close();
      }
      console.log(`데이터베이스 "${DEV_DB.database}"를 새로 만들고 예시 데이터를 넣었습니다.`);
    }
  } catch (e) {
    console.error("테이블을 맞추지 못했습니다:", e instanceof Error ? e.message : e);
  }
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
