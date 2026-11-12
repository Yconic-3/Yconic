import { Module, type DynamicModule } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import type { VideoAnalyzer } from "@yconic/content-analysis";
import type { Database } from "@yconic/database";
import { diskStorage } from "multer";
import { extname } from "node:path";
import { AdminController } from "./admin/admin.controller";
import { AdminService } from "./admin/admin.service";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AdminGuard, AuthGuard } from "./auth/guards";
import { newId } from "./common/ids";
import { videosDir, type ApiConfig } from "./config";
import { MeController } from "./me/me.controller";
import { MeService } from "./me/me.service";
import { PublicController } from "./public/public.controller";
import { ANALYZER, CONFIG, DB } from "./tokens";
import { WorkerService } from "./worker/worker.service";

/** 확장자는 영문·숫자만 남긴다 (저장 파일 이름에 사용자가 보낸 글자가 섞이지 않게) */
function safeExt(name: string): string {
  const ext = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

@Module({})
export class AppModule {
  static create(config: ApiConfig, db: Database, analyzer: VideoAnalyzer): DynamicModule {
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
      controllers: [AuthController, PublicController, AdminController, MeController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: DB, useValue: db },
        { provide: ANALYZER, useValue: analyzer },
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
