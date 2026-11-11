import { migrate } from "drizzle-orm/postgres-js/migrator";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "./index";

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

/** drizzle/ 아래의 마이그레이션 중 아직 반영하지 않은 것을 차례로 반영한다. */
export async function runMigrations(url?: string): Promise<void> {
  const { db, close } = connectDatabase(url);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await close();
  }
}
