import "reflect-metadata";
import { connectDatabase, databaseUrl } from "@yconic/database";
import { loadConfig } from "./config";
import { createApp } from "./create-app";

const config = loadConfig();
const { db, close } = connectDatabase();
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
