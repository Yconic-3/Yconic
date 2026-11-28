import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { AiModel } from "@yconic/ai-common";
import { createMockAnalyzer, type VideoAnalyzer } from "@yconic/content-analysis";
import type { Database } from "@yconic/database";
import { mkdirSync } from "node:fs";
import { AppModule } from "./app.module";
import { createGoogleVerifier, type GoogleVerifier } from "./auth/google";
import { ApiExceptionFilter } from "./common/errors";
import { videosDir, type ApiConfig } from "./config";

export interface CreateAppOptions {
  config: ApiConfig;
  db: Database;
  analyzer?: VideoAnalyzer;
  /** Claude 연결. 없으면 맞춤 안내를 규칙으로만 고른다 */
  ai?: AiModel | null;
  /** 구글 로그인 확인. 안 주면 설정의 클라이언트 ID로 만든다 (없으면 구글 로그인이 꺼진다) */
  google?: GoogleVerifier | null;
  /** 서버 기록을 끈다 (테스트용) */
  quiet?: boolean;
}

/** API 서버를 만든다. main.ts 와 테스트가 같은 함수를 쓴다. */
export async function createApp({ config, db, analyzer = createMockAnalyzer(), ai = null, google, quiet = false }: CreateAppOptions): Promise<NestExpressApplication> {
  mkdirSync(videosDir(config), { recursive: true });
  const verifier = google === undefined ? (config.googleClientId ? createGoogleVerifier(config.googleClientId) : null) : google;
  const app = await NestFactory.create<NestExpressApplication>(AppModule.create(config, db, analyzer, ai, verifier), {
    logger: quiet ? false : ["log", "warn", "error"],
  });
  app.disable("x-powered-by");
  app.enableCors({ origin: config.webOrigins });
  app.useBodyParser("json", { limit: "2mb" });
  // 나눠 올리는 영상 조각 (upload.ops.ts). 조각 크기보다 조금 넉넉하게 받는다
  app.useBodyParser("raw", { type: "application/octet-stream", limit: config.uploadChunkBytes + 1024 });
  app.useGlobalFilters(new ApiExceptionFilter());
  // 올린 영상 파일. 나중에 S3 호환 저장소의 서명된 주소로 바꾼다.
  app.useStaticAssets(config.storageDir, { prefix: "/media/", index: false, dotfiles: "deny" });
  app.enableShutdownHooks();
  return app;
}
