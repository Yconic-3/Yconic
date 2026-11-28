import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { AuthAccount, ContentJob, LearningProfile, MyContent, MyCourses, PersonalizedGuides, UploadProgress, UploadSession, VideoAsset } from "@yconic/shared-types";
import { parseCreateJob, parseCreateUpload, parseMyCourses, parseRecordPractice, parseSetMovement, parseSubmitMy, parseUpdateMyGuides, parseVideoMeta } from "../admin/validate";
import { AuthGuard, CurrentAccount } from "../auth/guards";
import type { UploadedVideoFile } from "../content/content.ops";
import { LearningService } from "./learning.service";
import { MeService } from "./me.service";

/** 회원 콘텐츠 올리기 API. 로그인만 하면 쓸 수 있다. 주소와 모양은 shared-types/creator-api.ts 에 적힌 대로다. */
@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    @Inject(MeService) private readonly me: MeService,
    @Inject(LearningService) private readonly learning: LearningService,
  ) {}

  // ── 학습 프로필과 맞춤 안내 (shared-types/movements.ts) ──

  @Get("learning")
  getLearning(@CurrentAccount() account: AuthAccount): Promise<LearningProfile> {
    return this.learning.getProfile(account);
  }

  @Put("learning/movements/:movementId")
  setMovement(@CurrentAccount() account: AuthAccount, @Param("movementId") movementId: string, @Body() body: unknown): Promise<LearningProfile> {
    const input = parseSetMovement(movementId, body);
    return this.learning.setMovement(account, input.movementId, input.known, input.terms);
  }

  @Post("learning/practice")
  @HttpCode(200)
  recordPractice(@CurrentAccount() account: AuthAccount, @Body() body: unknown): Promise<LearningProfile> {
    return this.learning.recordPractice(account, parseRecordPractice(body).movementIds);
  }

  /** 그 동작 단계를 다시 들었거나 "어려워요"라고 했다 (docs/decisions/0012) */
  @Post("learning/struggle")
  @HttpCode(200)
  recordStruggle(@CurrentAccount() account: AuthAccount, @Body() body: unknown): Promise<LearningProfile> {
    return this.learning.recordStruggle(account, parseRecordPractice(body).movementIds);
  }

  @Get("guides/:exerciseId")
  getGuides(@CurrentAccount() account: AuthAccount, @Param("exerciseId") exerciseId: string): Promise<PersonalizedGuides> {
    return this.learning.getGuides(account, exerciseId);
  }

  @Get("courses")
  getCourses(@CurrentAccount() account: AuthAccount): Promise<MyCourses> {
    return this.me.getCourses(account);
  }

  @Put("courses")
  setCourses(@CurrentAccount() account: AuthAccount, @Body() body: unknown): Promise<MyCourses> {
    return this.me.setCourses(account, parseMyCourses(body));
  }

  @Post("videos")
  @UseInterceptors(FileInterceptor("file"))
  uploadVideo(@CurrentAccount() account: AuthAccount, @UploadedFile() file: UploadedVideoFile | undefined, @Body() body: Record<string, unknown>): Promise<VideoAsset> {
    let meta: ReturnType<typeof parseVideoMeta> | Error;
    try {
      meta = parseVideoMeta(body ?? {});
    } catch (e) {
      meta = e as Error;
    }
    return this.me.uploadVideo(account, file, meta);
  }

  // 영상 나눠 올리기 (shared-types/upload.ts)

  @Post("uploads")
  startUpload(@CurrentAccount() account: AuthAccount, @Body() body: unknown): Promise<UploadSession> {
    return this.me.startUpload(account, parseCreateUpload(body));
  }

  @Put("uploads/:id/chunks/:index")
  uploadChunk(@CurrentAccount() account: AuthAccount, @Param("id") id: string, @Param("index") index: string, @Body() chunk: unknown): Promise<UploadProgress> {
    return this.me.uploadChunk(account, id, Number(index), chunk);
  }

  @Post("uploads/:id/complete")
  finishUpload(@CurrentAccount() account: AuthAccount, @Param("id") id: string): Promise<VideoAsset> {
    return this.me.finishUpload(account, id);
  }

  @Delete("uploads/:id")
  @HttpCode(204)
  cancelUpload(@CurrentAccount() account: AuthAccount, @Param("id") id: string): Promise<void> {
    return this.me.cancelUpload(account, id);
  }

  @Delete("videos/:id")
  @HttpCode(204)
  deleteVideo(@CurrentAccount() account: AuthAccount, @Param("id") id: string): Promise<void> {
    return this.me.deleteVideo(account, id);
  }

  @Post("content-jobs")
  createJob(@CurrentAccount() account: AuthAccount, @Body() body: unknown): Promise<ContentJob> {
    return this.me.createJob(account, parseCreateJob(body));
  }

  @Get("content-jobs/:id")
  getJob(@CurrentAccount() account: AuthAccount, @Param("id") id: string): Promise<ContentJob> {
    return this.me.getJob(account, id);
  }

  @Get("contents")
  listContents(@CurrentAccount() account: AuthAccount): Promise<MyContent[]> {
    return this.me.listContents(account);
  }

  @Get("contents/:id")
  getContent(@CurrentAccount() account: AuthAccount, @Param("id") id: string): Promise<MyContent> {
    return this.me.getContent(account, id);
  }

  @Patch("contents/:id/guides")
  updateGuides(@CurrentAccount() account: AuthAccount, @Param("id") id: string, @Body() body: unknown): Promise<MyContent> {
    return this.me.updateGuides(account, id, parseUpdateMyGuides(body));
  }

  @Post("contents/:id/submit")
  @HttpCode(200)
  submit(@CurrentAccount() account: AuthAccount, @Param("id") id: string, @Body() body: unknown): Promise<MyContent> {
    return this.me.submit(account, id, parseSubmitMy(body));
  }
}
