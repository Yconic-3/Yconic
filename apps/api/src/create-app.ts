import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { AiModel } from "@yconic/ai-common";
import { createMockAnalyzer, type VideoAnalyzer } from "@yconic/content-analysis";
import type { Database } from "@yconic/database";
import { mkdirSync } from "node:fs";
import { AppModule } from "./app.module";
import { createGoogleVerifier, type GoogleVerifier } from "./auth/google";
import { ApiExceptionFilter } from "./common/errors";
import { ttsDir, videosDir, type ApiConfig } from "./config";
import { createGoogleSynthesizer, type SpeechSynthesizer } from "./tts/synthesizer";

export interface CreateAppOptions {
  config: ApiConfig;
  db: Database;
  analyzer?: VideoAnalyzer;
  /** Claude 연결. 없으면 맞춤 안내를 규칙으로만 고른다 */
  ai?: AiModel | null;
  /** 구글 로그인 확인. 안 주면 설정의 클라이언트 ID로 만든다 (없으면 구글 로그인이 꺼진다) */
  google?: GoogleVerifier | null;
  /** 글을 음성으로 만드는 함수. 안 주면 설정의 키로 만든다 (없으면 서버 목소리가 꺼진다) */
  tts?: SpeechSynthesizer | null;
  /** 서버 기록을 끈다 (테스트용) */
  quiet?: boolean;
}

/** API 서버를 만든다. main.ts 와 테스트가 같은 함수를 쓴다. */
export async function createApp({ config, db, analyzer = createMockAnalyzer(), ai = null, google, tts, quiet = false }: CreateAppOptions): Promise<NestExpressApplication> {
  mkdirSync(videosDir(config), { recursive: true });
  const verifier = google === undefined ? (config.googleClientId ? createGoogleVerifier(config.googleClientId) : null) : google;
  const synthesizer = tts === undefined ? (config.googleTtsApiKey ? createGoogleSynthesizer({ apiKey: config.googleTtsApiKey, voice: config.ttsVoice }) : null) : tts;
  mkdirSync(ttsDir(config), { recursive: true });
  const app = await NestFactory.create<NestExpressApplication>(AppModule.create(config, db, analyzer, ai, verifier, synthesizer), {
    logger: quiet ? false : ["log", "warn", "error"],
  });
  app.disable("x-powered-by");
  app.enableCors({ origin: config.webOrigins });
  app.useBodyParser("json", { limit: "2mb" });
  // 나눠 올리는 영상 조각 (upload.ops.ts). 조각 크기보다 조금 넉넉하게 받는다
  app.useBodyParser("raw", { type: "application/octet-stream", limit: config.uploadChunkBytes + 1024 });
  app.useGlobalFilters(new ApiExceptionFilter());
  // 올린 영상 파일과 서버가 만든 음성 파일만 공개한다. 나중에 S3 호환 저장소의 서명된 주소로 바꾼다.
  // 저장 폴더 전체를 열면 올리는 중인 조각(storage/uploads)까지 주소로 열리므로, 공개할 폴더만 하나씩 연다.
  app.useStaticAssets(videosDir(config), { prefix: "/media/videos/", index: false, dotfiles: "deny" });
  app.useStaticAssets(ttsDir(config), { prefix: "/media/tts/", index: false, dotfiles: "deny", immutable: true, maxAge: "30d" });
  app.enableShutdownHooks();
  return app;
}
