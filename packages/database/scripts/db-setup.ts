/**
 * 테이블을 반영하고(마이그레이션) 처음 데이터를 넣는다.
 *   pnpm db:migrate  → 아직 반영하지 않은 마이그레이션만 반영 (데이터는 그대로)
 *   pnpm db:seed     → 데이터를 모두 지우고 예시 데이터를 다시 넣는다
 *   pnpm db:setup    → 둘 다
 * 먼저 다른 창에서 `pnpm db:start`로 PostgreSQL을 켜 둔다.
 */
import { connectDatabase, databaseUrl } from "../src/index";
import { runMigrations } from "../src/migrate";
import { seedDatabase } from "../src/seed";

const steps = new Set(process.argv.slice(2));

async function main() {
  const url = databaseUrl();
  console.log("데이터베이스:", url.replace(/:[^:@/]+@/, ":****@"));
  if (steps.has("migrate")) {
    await runMigrations(url);
    console.log("테이블을 반영했습니다 (마이그레이션).");
  }
  if (steps.has("seed")) {
    const { db, close } = connectDatabase(url);
    try {
      await seedDatabase(db);
    } finally {
      await close();
    }
    console.log("예시 데이터를 넣었습니다. 시연용 계정은 apps/web/README.md의 로그인 표를 보세요.");
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("실패:", msg);
  if (/ECONNREFUSED|connect/i.test(msg)) console.error("PostgreSQL이 꺼져 있는 것 같습니다. 다른 창에서 pnpm db:start 를 먼저 실행하세요.");
  process.exit(1);
});
