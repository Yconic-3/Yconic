import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { AdminUser, AuditLog, ContentJob, ExerciseContent, PlaybackUrlResponse, VideoAsset } from "@yconic/shared-types";
import { AdminGuard, AuthGuard, CurrentAdmin } from "../auth/guards";
import { AdminService, type UploadedVideoFile } from "./admin.service";
import {
  parseChangeStatus,
  parseCreateJob,
  parseListFilter,
  parseReanalyze,
  parseReplaceVideo,
  parseRequestTts,
  parseUpdateContent,
  parseVideoMeta,
} from "./validate";

/** 관리자 화면용 API. 주소와 모양은 shared-types/admin-api.ts 에 적힌 대로다. */
@Controller("admin")
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  // ── 영상 ──

  @Post("videos")
  @UseInterceptors(FileInterceptor("file"))
  uploadVideo(@CurrentAdmin() user: AdminUser, @UploadedFile() file: UploadedVideoFile | undefined, @Body() body: Record<string, unknown>): Promise<VideoAsset> {
    let meta: ReturnType<typeof parseVideoMeta> | Error;
    try {
      meta = parseVideoMeta(body ?? {});
    } catch (e) {
      meta = e as Error;
    }
    // 검사에 실패해도 서비스가 저장된 파일을 지울 수 있도록 넘긴다.
    return this.admin.uploadVideo(user, file, meta);
  }

  @Get("videos/:id/playback-url")
  playbackUrl(@CurrentAdmin() user: AdminUser, @Param("id") id: string): Promise<PlaybackUrlResponse> {
    return this.admin.getVideoPlaybackUrl(user, id);
  }

  @Delete("videos/:id")
  @HttpCode(204)
  deleteVideo(@CurrentAdmin() user: AdminUser, @Param("id") id: string): Promise<void> {
    return this.admin.deleteVideo(user, id);
  }

  // ── 콘텐츠 ──

  @Get("contents")
  listContents(@CurrentAdmin() user: AdminUser, @Query() query: Record<string, unknown>): Promise<ExerciseContent[]> {
    return this.admin.listContents(user, parseListFilter(query));
  }

  @Get("contents/:id")
  getContent(@CurrentAdmin() user: AdminUser, @Param("id") id: string): Promise<ExerciseContent> {
    return this.admin.getContent(user, id);
  }

  @Patch("contents/:id")
  updateContent(@CurrentAdmin() user: AdminUser, @Param("id") id: string, @Body() body: unknown): Promise<ExerciseContent> {
    return this.admin.updateContent(user, id, parseUpdateContent(body));
  }

  @Put("contents/:id/video")
  replaceVideo(@CurrentAdmin() user: AdminUser, @Param("id") id: string, @Body() body: unknown): Promise<ExerciseContent> {
    const input = parseReplaceVideo(body);
    return this.admin.replaceContentVideo(user, id, input.videoId, input.expectedVersion);
  }

  @Post("contents/:id/reanalyze")
  reanalyze(@CurrentAdmin() user: AdminUser, @Param("id") id: string, @Body() body: unknown): Promise<ContentJob> {
    const input = parseReanalyze(body);
    return this.admin.reanalyzeContent(user, id, input.requestNote, input.expectedVersion);
  }

  @Post("contents/:id/actions")
  @HttpCode(200)
  changeStatus(@CurrentAdmin() user: AdminUser, @Param("id") id: string, @Body() body: unknown): Promise<ExerciseContent> {
    const input = parseChangeStatus(body);
    return this.admin.changeContentStatus(user, id, input.action, input.comment);
  }

  @Post("contents/:id/tts")
  @HttpCode(200)
  requestTts(@CurrentAdmin() user: AdminUser, @Param("id") id: string, @Body() body: unknown): Promise<ExerciseContent> {
    return this.admin.requestTts(user, id, parseRequestTts(body).segmentIds);
  }

  // ── AI 제작 작업 ──

  @Get("content-jobs")
  listJobs(@CurrentAdmin() user: AdminUser): Promise<ContentJob[]> {
    return this.admin.listJobs(user);
  }

  @Post("content-jobs")
  createJob(@CurrentAdmin() user: AdminUser, @Body() body: unknown): Promise<ContentJob> {
    return this.admin.createJob(user, parseCreateJob(body));
  }

  @Post("content-jobs/:id/retry")
  @HttpCode(200)
  retryJob(@CurrentAdmin() user: AdminUser, @Param("id") id: string): Promise<ContentJob> {
    return this.admin.retryJob(user, id);
  }

  // ── 감사 로그 ──

  @Get("audit-logs")
  listAuditLogs(@CurrentAdmin() user: AdminUser, @Query("targetId") targetId?: string): Promise<AuditLog[]> {
    return this.admin.listAuditLogs(user, typeof targetId === "string" && targetId ? targetId : undefined);
  }
}
