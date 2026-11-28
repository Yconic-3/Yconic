import { Module, type DynamicModule } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import type { VideoAnalyzer } from "@yconic/content-analysis";
import type { Database } from "@yconic/database";
import { diskStorage } from "multer";
import { AdminController } from "./admin/admin.controller";
import { AdminService } from "./admin/admin.service";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AdminGuard, AuthGuard } from "./auth/guards";
import { newId } from "./common/ids";
import { safeExt } from "./content/content.ops";
import { videosDir, type ApiConfig } from "./config";
import { MeController } from "./me/me.controller";
import { MeService } from "./me/me.service";
import { PublicController } from "./public/public.controller";
import { AI, ANALYZER, CONFIG, DB, GOOGLE, TTS } from "./tokens";
import type { SpeechSynthesizer } from "./tts/synthesizer";
import { TtsController } from "./tts/tts.controller";
import { TtsService } from "./tts/tts.service";
import type { GoogleVerifier } from "./auth/google";
import type { AiModel } from "@yconic/ai-common";
import { LearningService } from "./me/learning.service";
import { WorkerService } from "./worker/worker.service";

@Module({})
export class AppModule {
  static create(config: ApiConfig, db: Database, analyzer: VideoAnalyzer, ai: AiModel | null, google: GoogleVerifier | null, tts: SpeechSynthesizer | null): DynamicModule {
    return {
      module: AppModule,
      imports: [
        MulterModule.register({
          storage: diskStorage({
            destination: videosDir(config),
            filename: (_req, file, cb) => cb(null, `${newId("v")}${safeExt(file.originalname)}`),
          }),
          limits: { fileSize: config.maxVideoBytes, files: 1 },
          // 한글 파일 이름이 깨지지 않게 한다.
          defParamCharset: "utf8",
        }),
      ],
      controllers: [AuthController, PublicController, AdminController, MeController, TtsController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: DB, useValue: db },
        { provide: ANALYZER, useValue: analyzer },
        { provide: AI, useValue: ai },
        { provide: GOOGLE, useValue: google },
        { provide: TTS, useValue: tts },
        TtsService,
        LearningService,
        AuthService,
        AuthGuard,
        AdminGuard,
        AdminService,
        MeService,
        WorkerService,
      ],
    };
  }
}
