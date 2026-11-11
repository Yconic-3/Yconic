import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/config";

// 테이블 정의(src/schema.ts)가 바뀌면 `pnpm db:generate`로 drizzle/ 아래에 마이그레이션 SQL을 만든다.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl() },
  strict: true,
  verbose: true,
});
