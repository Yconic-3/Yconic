import { runMigrations } from "@yconic/database/migrate";
import { startPostgres } from "@yconic/database/server";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

/**
 * 테스트마다 쓰고 버리는 PostgreSQL을 켠다. 개발용 DB(5433)는 건드리지 않는다.
 * 환경 변수 TEST_DATABASE_URL이 있으면 그 DB를 쓴다 (CI에서 서비스 컨테이너를 쓸 때).
 */
export default async function setup(project: TestProject) {
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    await runMigrations(external);
    project.provide("databaseUrl", external);
    return;
  }
  const dataDir = mkdtempSync(join(tmpdir(), "yconic-api-test-"));
  const port = await freePort();
  const server = await startPostgres({ dataDir, port, user: "yconic", password: "yconic", database: "yconic_test", log: () => {} });
  const url = `postgres://yconic:yconic@localhost:${port}/yconic_test`;
  await runMigrations(url);
  project.provide("databaseUrl", url);
  return async () => {
    server.stop();
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
}
