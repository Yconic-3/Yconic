import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { AuthAccount, ContentJob, MyContent, MyCourses, VideoAsset } from "@yconic/shared-types";
import { parseCreateJob, parseMyCourses, parseSubmitMy, parseUpdateMyGuides, parseVideoMeta } from "../admin/validate";
import { AuthGuard, CurrentAccount } from "../auth/guards";
import type { UploadedVideoFile } from "../content/content.ops";
import { MeService } from "./me.service";

/** 회원 콘텐츠 올리기 API. 로그인만 하면 쓸 수 있다. 주소와 모양은 shared-types/creator-api.ts 에 적힌 대로다. */
@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(@Inject(MeService) private readonly me: MeService) {}

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
