import { Inject, Injectable } from "@nestjs/common";
import { accountCourses, contentJobs, contents, segments, videos, type Database } from "@yconic/database";
import {
  canCreatorEdit,
  CONTENT_STATUS_LABELS,
  creatorSubmitBlockedReason,
  toMyContent,
  type AuthAccount,
  type ContentJob,
  type CreateContentJobInput,
  type CourseId,
  type MyContent,
  type MyCourses,
  type SubmitMyContentInput,
  type UpdateMyGuidesInput,
  type VideoAsset,
} from "@yconic/shared-types";
import { and, eq, notInArray } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { ApiError, notFound } from "../common/errors";
import { videosDir, type ApiConfig } from "../config";
import { insertCreateJob, saveUploadedVideo, type UploadedVideoFile, type VideoMeta } from "../content/content.ops";
import { loadContents, loadJobs, writeAudit, type Actor, type Db } from "../content/content.store";
import { CONFIG, DB } from "../tokens";

const FINISHED_JOB = ["COMPLETED", "FAILED"] as const;

function actorOf(account: AuthAccount): Actor {
  return { id: account.id, name: account.name, role: account.adminRole };
}

/**
 * 회원 콘텐츠 올리기 (docs/decisions/0007). 로그인한 회원이면 누구나 쓴다.
 * 자기가 올린 것만 다룬다: 남의 영상·작업·콘텐츠는 없는 것처럼 404로 답한다.
 * 검수 요청까지만 하고, 승인·공개는 관리자 API(승인권자)만 한다. 자기 승인 금지 규칙은 그대로다.
 */
@Injectable()
export class MeService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: ApiConfig,
  ) {}

  // ── 내 강의 ──

  async getCourses(account: AuthAccount): Promise<MyCourses> {
    const rows = await this.db.select({ courseId: accountCourses.courseId }).from(accountCourses).where(eq(accountCourses.accountId, account.id));
    return { courseIds: rows.map((r) => r.courseId as CourseId) };
  }

  async setCourses(account: AuthAccount, input: MyCourses): Promise<MyCourses> {
    await this.db.transaction(async (tx) => {
      await tx.delete(accountCourses).where(eq(accountCourses.accountId, account.id));
      if (input.courseIds.length) await tx.insert(accountCourses).values(input.courseIds.map((courseId) => ({ accountId: account.id, courseId })));
    });
    return this.getCourses(account);
  }

  // ── 영상 ──

  uploadVideo(account: AuthAccount, file: UploadedVideoFile | undefined, meta: VideoMeta | Error): Promise<VideoAsset> {
    return saveUploadedVideo(this.db, this.config, account.id, file, meta);
  }

  async deleteVideo(account: AuthAccount, videoId: string): Promise<void> {
    const storageKey = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(videos)
        .where(and(eq(videos.id, videoId), eq(videos.uploadedBy, account.id)))
        .for("update");
      if (!row) throw notFound("영상");
      const [usedByContent] = await tx.select({ id: contents.id }).from(contents).where(eq(contents.videoId, videoId)).limit(1);
      const [usedByJob] = await tx.select({ id: contentJobs.id }).from(contentJobs).where(eq(contentJobs.videoId, videoId)).limit(1);
      if (usedByContent || usedByJob) throw new ApiError("CONFLICT", "작업이나 콘텐츠에 연결된 영상은 지울 수 없습니다.");
      await tx.delete(videos).where(eq(videos.id, videoId));
      await writeAudit(tx, actorOf(account), "VIDEO_DELETED", "VIDEO", videoId, `연결되지 않은 영상 삭제: ${row.fileName}`);
      return row.storageKey;
    });
    if (storageKey) await rm(join(videosDir(this.config), storageKey), { force: true });
  }

  // ── AI 제작 작업 ──

  async createJob(account: AuthAccount, input: CreateContentJobInput): Promise<ContentJob> {
    const [video] = await this.db
      .select()
      .from(videos)
      .where(and(eq(videos.id, input.videoId), eq(videos.uploadedBy, account.id)));
    if (!video) throw new ApiError("NOT_FOUND", "영상을 찾을 수 없습니다. 먼저 영상을 올려 주세요.");
    const jobId = await this.db.transaction((tx) => insertCreateJob(tx, actorOf(account), input, video));
    return this.getJob(account, jobId);
  }

  async getJob(account: AuthAccount, id: string): Promise<ContentJob> {
    const [job] = await loadJobs(this.db, this.config, and(eq(contentJobs.id, id), eq(contentJobs.requestedBy, account.id)));
    if (!job) throw notFound("제작 작업");
    return job;
  }

  // ── 내 콘텐츠 ──

  async listContents(account: AuthAccount): Promise<MyContent[]> {
    return (await loadContents(this.db, this.config, eq(contents.createdBy, account.id))).map(toMyContent);
  }

  private async findOwn(db: Db, account: AuthAccount, id: string): Promise<MyContent> {
    const [c] = await loadContents(db, this.config, and(eq(contents.id, id), eq(contents.createdBy, account.id)));
    if (!c) throw notFound("콘텐츠");
    return toMyContent(c);
  }

  getContent(account: AuthAccount, id: string): Promise<MyContent> {
    return this.findOwn(this.db, account, id);
  }

  /** 잠그고 읽은 뒤 고칠 수 있는지 확인한다 */
  private async lockEditable(tx: Db, account: AuthAccount, id: string, expectedVersion: number) {
    const [row] = await tx
      .select()
      .from(contents)
      .where(and(eq(contents.id, id), eq(contents.createdBy, account.id)))
      .for("update");
    if (!row) throw notFound("콘텐츠");
    if (!canCreatorEdit(row)) throw new ApiError("FORBIDDEN", `${CONTENT_STATUS_LABELS[row.status]} 상태의 콘텐츠는 고칠 수 없습니다.`);
    if (row.version !== expectedVersion) throw new ApiError("CONFLICT", "다른 곳에서 먼저 수정했습니다. 새로 고친 뒤 다시 시도해 주세요.");
    const [reanalysis] = await tx
      .select({ id: contentJobs.id })
      .from(contentJobs)
      .where(and(eq(contentJobs.kind, "REANALYZE"), eq(contentJobs.contentId, id), notInArray(contentJobs.status, [...FINISHED_JOB])));
    if (reanalysis) throw new ApiError("CONFLICT", "운영자가 다시 분석하는 중입니다. 끝난 뒤 다시 시도해 주세요.");
    return row;
  }

  async updateGuides(account: AuthAccount, id: string, input: UpdateMyGuidesInput): Promise<MyContent> {
    return this.db.transaction(async (tx) => {
      const row = await this.lockEditable(tx, account, id, input.expectedVersion);
      const own = new Set((await tx.select({ id: segments.id }).from(segments).where(eq(segments.contentId, id))).map((s) => s.id));
      const unknown = input.segments.find((s) => !own.has(s.id));
      if (unknown) throw new ApiError("VALIDATION", "이 콘텐츠에 없는 단계입니다. 새로 고친 뒤 다시 시도해 주세요.");
      for (const s of input.segments) {
        await tx.update(segments).set({ voiceGuide: s.voiceGuide }).where(eq(segments.id, s.id));
      }
      await tx
        .update(contents)
        .set({ updatedBy: account.id, updatedAt: new Date(), version: row.version + 1 })
        .where(eq(contents.id, id));
      await writeAudit(tx, actorOf(account), "CONTENT_UPDATED", "CONTENT", id, `올린 사람이 음성 안내 수정: ${row.title} (단계 ${input.segments.length}개)`);
      return this.findOwn(tx, account, id);
    });
  }

  async submit(account: AuthAccount, id: string, input: SubmitMyContentInput): Promise<MyContent> {
    return this.db.transaction(async (tx) => {
      const row = await this.lockEditable(tx, account, id, input.expectedVersion);
      const current = await this.findOwn(tx, account, id);
      const blocked = creatorSubmitBlockedReason(current, input.confirmed);
      if (blocked) throw new ApiError("VALIDATION", blocked);
      await tx
        .update(contents)
        .set({ status: "IN_REVIEW", submittedBy: account.id, updatedBy: account.id, updatedAt: new Date(), version: row.version + 1 })
        .where(eq(contents.id, id));
      await writeAudit(
        tx,
        actorOf(account),
        "CONTENT_STATUS_CHANGED",
        "CONTENT",
        id,
        `${CONTENT_STATUS_LABELS[row.status]} → ${CONTENT_STATUS_LABELS.IN_REVIEW} (올린 사람이 확인하고 검수 요청)`,
      );
      return this.findOwn(tx, account, id);
    });
  }
}
