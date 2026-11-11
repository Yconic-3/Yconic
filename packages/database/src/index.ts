import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseUrl } from "./config";
import * as schema from "./schema";

export * from "./schema";
export { databaseUrl, DEV_DB } from "./config";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseConnection {
  db: Database;
  /** 연결을 닫는다 (테스트·스크립트 끝에서 호출) */
  close(): Promise<void>;
}

export function connectDatabase(url: string = databaseUrl()): DatabaseConnection {
  const client = postgres(url, { max: 10, onnotice: () => undefined });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}
