import { Inject, Injectable } from "@nestjs/common";
import { auditLogs, contentJobs, contents, segments, videos, type Database } from "@yconic/database";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_TRANSITIONS,
  canEditContent,
  canPerformAction,
  hasPermission,
  selfApprovalBlockedReason,
  type AdminPermission,
  type AdminUser,
  type AuditLog,
  type ContentAction,
  type ContentJob,
  type ContentListFilter,
  type ExerciseContent,
  type VideoAsset,
} from "@yconic/shared-types";
import { and, desc, eq, ilike, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { ApiError, notFound } from "../common/errors";
import { newId } from "../common/ids";
import { videosDir, type ApiConfig } from "../config";
import { loadContents, loadJobs, toVideoAsset, videoUrl, writeAudit, type Db } from "../content/content.store";
import { CONFIG, DB } from "../tokens";
import type { SegmentInput, UpdateContentBody } from "./validate";

const FINISHED_JOB = ["COMPLETED", "FAILED"] as const;

function requirePermission(user: AdminUser, p: AdminPermission) {
  if (!hasPermission(user.role, p)) throw new ApiError("FORBIDDEN", "이 작업을 할 권한이 없습니다.");
}

export interface UploadedVideoFile {
  /** 저장소에 저장된 파일 이름 */
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * 관리자 화면의 모든 데이터 처리. 규칙은 웹앱 모의 구현(apps/web/src/mock/mock-admin-api.ts)과 같고,
 * 권한표·상태 전이·자기 승인 금지는 shared-types 함수로 검사한다.
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: ApiConfig,
  ) {}

  // ── 공통 ──

  private async getContentOrThrow(db: Db, id: string, lock = false): Promise<typeof contents.$inferSelect> {
    const q = db.select().from(contents).where(eq(contents.id, id));
    const [row] = lock ? await q.for("update") : await q;
    if (!row) throw notFound("콘텐츠");
    return row;
  }

  private async findContent(db: Db, id: string): Promise<ExerciseContent> {
    const [c] = await loadContents(db, this.config, eq(contents.id, id));
    if (!c) throw notFound("콘텐츠");
    return c;
  }

  private async activeReanalysis(db: Db, contentId: string) {
    const [row] = await db
      .select({ id: contentJobs.id })
      .from(contentJobs)
      .where(and(eq(contentJobs.kind, "REANALYZE"), eq(contentJobs.contentId, contentId), notInArray(contentJobs.status, [...FINISHED_JOB])));
    return row ?? null;
  }

  private requireEditable(user: AdminUser, row: typeof contents.$inferSelect) {
    if (!canEditContent(user.role, row.status)) {
      throw new ApiError("FORBIDDEN", `${CONTENT_STATUS_LABELS[row.status]} 상태의 콘텐츠는 수정할 수 없거나 수정 권한이 없습니다.`);
    }
  }

  private requireVersion(row: typeof contents.$inferSelect, expected: number) {
    if (row.version !== expected) throw new ApiError("CONFLICT", "다른 사람이 먼저 수정했습니다. 새로 고친 뒤 다시 시도해 주세요.");
  }

  // ── 영상 ──

  async uploadVideo(user: AdminUser, file: UploadedVideoFile | undefined, meta: { durationSec: number; width: number; height: number } | Error): Promise<VideoAsset> {
    const cleanup = async () => {
      if (file) await rm(join(videosDir(this.config), file.filename), { force: true });
    };
    try {
      requirePermission(user, "job:create");
      if (!file) throw new ApiError("VALIDATION", "영상 파일을 함께 보내 주세요.");
      if (!file.mimetype.startsWith("video/")) throw new ApiError("VALIDATION", "영상 파일만 올릴 수 있습니다.");
      if (meta instanceof Error) throw meta;
      const [row] = await this.db
        .insert(videos)
        .values({
          id: newId("v"),
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          durationSec: meta.durationSec,
          width: meta.width,
          height: meta.height,
          storageKey: file.filename,
          uploadedBy: user.id,
        })
        .returning();
      return toVideoAsset(this.config, row!);
    } catch (e) {
      await cleanup();
      throw e;
    }
  }

  async getVideoPlaybackUrl(user: AdminUser, videoId: string): Promise<{ url: string | null }> {
    requirePermission(user, "content:read");
    const [row] = await this.db.select().from(videos).where(eq(videos.id, videoId));
    if (!row) throw notFound("영상");
    return { url: videoUrl(this.config, row) };
  }

  async deleteVideo(user: AdminUser, videoId: string): Promise<void> {
    requirePermission(user, "job:create");
    const storageKey = await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(videos).where(eq(videos.id, videoId)).for("update");
      if (!row) throw notFound("영상");
      const [usedByContent] = await tx.select({ id: contents.id }).from(contents).where(eq(contents.videoId, videoId)).limit(1);
      const [usedByJob] = await tx.select({ id: contentJobs.id }).from(contentJobs).where(eq(contentJobs.videoId, videoId)).limit(1);
      if (usedByContent || usedByJob) throw new ApiError("CONFLICT", "작업이나 콘텐츠에 연결된 영상은 지울 수 없습니다.");
      await tx.delete(videos).where(eq(videos.id, videoId));
      await writeAudit(tx, user, "VIDEO_DELETED", "VIDEO", videoId, `연결되지 않은 영상 삭제: ${row.fileName}`);
      return row.storageKey;
    });
    if (storageKey) await rm(join(videosDir(this.config), storageKey), { force: true });
  }

  // ── 콘텐츠 ──

  async listContents(user: AdminUser, filter: ContentListFilter): Promise<ExerciseContent[]> {
    requirePermission(user, "content:read");
    const conds: SQL[] = [];
    if (filter.status) conds.push(eq(contents.status, filter.status));
    if (filter.query) {
      const like = `%${filter.query.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      conds.push(
        or(
          ilike(contents.title, like),
          ilike(contents.summary, like),
          sql`exists (select 1 from unnest(${contents.tags}) t where t ilike ${like})`,
          sql`exists (select 1 from ${videos} v where v.id = ${contents.videoId} and v.file_name ilike ${like})`,
        )!,
      );
    }
    return loadContents(this.db, this.config, conds.length ? and(...conds) : undefined);
  }

  async getContent(user: AdminUser, id: string): Promise<ExerciseContent> {
    requirePermission(user, "content:read");
    return this.findContent(this.db, id);
  }

  async updateContent(user: AdminUser, id: string, input: UpdateContentBody): Promise<ExerciseContent> {
    return this.db.transaction(async (tx) => {
      const row = await this.getContentOrThrow(tx, id, true);
      this.requireEditable(user, row);
      this.requireVersion(row, input.expectedVersion);
      if (await this.activeReanalysis(tx, id)) throw new ApiError("CONFLICT", "다시 분석이 진행 중입니다. 끝난 뒤 수정해 주세요.");

      // 음성 파일 상태는 서버가 관리한다. 같은 구간은 기존 값을 유지하고, 새 구간은 "미생성"으로 시작한다.
      const before = new Map((await tx.select().from(segments).where(eq(segments.contentId, id))).map((s) => [s.id, s]));
      await tx.delete(segments).where(eq(segments.contentId, id));
      if (input.segments.length > 0) {
        await tx.insert(segments).values(input.segments.map((s, i) => this.segmentRow(id, s, i, before.get(s.id))));
      }
      await tx
        .update(contents)
        .set({
          title: input.title,
          summary: input.summary,
          category: input.category,
          difficulty: input.difficulty,
          tags: input.tags,
          precautions: input.precautions,
          internalNote: input.internalNote,
          updatedBy: user.id,
          updatedAt: new Date(),
          version: row.version + 1,
        })
        .where(eq(contents.id, id));
      await writeAudit(tx, user, "CONTENT_UPDATED", "CONTENT", id, `콘텐츠 수정: ${input.title} (v${row.version + 1}, 구간 ${input.segments.length}개)`);
      return this.findContent(tx, id);
    });
  }

  private segmentRow(contentId: string, s: SegmentInput, i: number, prev: typeof segments.$inferSelect | undefined) {
    return {
      // 화면에서 새로 만든 구간(임시 ID)은 서버가 ID를 새로 준다.
      id: prev ? s.id : newId("s"),
      contentId,
      position: i + 1,
      kind: s.kind,
      startSec: s.startSec,
      endSec: s.endSec,
      title: s.title,
      instruction: s.instruction,
      voiceGuide: s.voiceGuide,
      repetitions: s.repetitions,
      ttsStatus: prev?.ttsStatus ?? "NONE",
      ttsAudioUrl: prev?.ttsAudioUrl ?? null,
      ttsGeneratedForText: prev?.ttsGeneratedForText ?? null,
      ttsFailureReason: prev?.ttsFailureReason ?? null,
      ttsRequestedAt: prev?.ttsRequestedAt ?? null,
      ttsPendingText: prev?.ttsPendingText ?? null,
    } satisfies typeof segments.$inferInsert;
  }

  async replaceContentVideo(user: AdminUser, id: string, videoId: string, expectedVersion: number): Promise<ExerciseContent> {
    requirePermission(user, "job:create");
    return this.db.transaction(async (tx) => {
      const row = await this.getContentOrThrow(tx, id, true);
      this.requireEditable(user, row);
      this.requireVersion(row, expectedVersion);
      if (await this.activeReanalysis(tx, id)) throw new ApiError("CONFLICT", "다시 분석이 진행 중입니다. 끝난 뒤 영상을 바꿔 주세요.");
      const [before] = await tx.select().from(videos).where(eq(videos.id, row.videoId));
      const [next] = await tx.select().from(videos).where(eq(videos.id, videoId));
      if (!next) throw notFound("영상");
      await tx.update(contents).set({ videoId, updatedBy: user.id, updatedAt: new Date(), version: row.version + 1 }).where(eq(contents.id, id));
      await writeAudit(
        tx,
        user,
        "CONTENT_VIDEO_REPLACED",
        "CONTENT",
        id,
        `영상 교체: ${before?.fileName} (${Math.round(before?.durationSec ?? 0)}초) → ${next.fileName} (${Math.round(next.durationSec)}초)`,
      );
      return this.findContent(tx, id);
    });
  }

  async reanalyzeContent(user: AdminUser, id: string, requestNote: string, expectedVersion: number): Promise<ContentJob> {
    requirePermission(user, "job:create");
    const jobId = await this.db.transaction(async (tx) => {
      const row = await this.getContentOrThrow(tx, id, true);
      this.requireEditable(user, row);
      this.requireVersion(row, expectedVersion);
      if (await this.activeReanalysis(tx, id)) throw new ApiError("CONFLICT", "이미 다시 분석이 진행 중입니다.");
      const [video] = await tx.select().from(videos).where(eq(videos.id, row.videoId));
      const jobId = newId("j");
      await tx.insert(contentJobs).values({
        id: jobId,
        kind: "REANALYZE",
        title: row.title,
        category: row.category,
        difficulty: row.difficulty,
        requestNote: requestNote.trim(),
        videoId: row.videoId,
        contentId: id,
        requestedBy: user.id,
        simulateFailure: /fail/i.test(video?.fileName ?? ""),
      });
      await writeAudit(tx, user, "CONTENT_JOB_CREATED", "CONTENT_JOB", jobId, `다시 분석 요청: ${row.title} (${video?.fileName})`);
      return jobId;
    });
    return (await loadJobs(this.db, this.config, eq(contentJobs.id, jobId)))[0]!;
  }

  async changeContentStatus(user: AdminUser, id: string, action: ContentAction, comment?: string): Promise<ExerciseContent> {
    return this.db.transaction(async (tx) => {
      const row = await this.getContentOrThrow(tx, id, true);
      const t = CONTENT_TRANSITIONS[action];
      if (!canPerformAction(user.role, row.status, action)) {
        throw new ApiError("FORBIDDEN", `${CONTENT_STATUS_LABELS[row.status]} 상태에서 "${t.label}"을(를) 할 수 없거나 권한이 없습니다.`);
      }
      if (action === "SUBMIT_FOR_REVIEW" && (await this.activeReanalysis(tx, id))) {
        throw new ApiError("CONFLICT", "다시 분석이 진행 중입니다. 끝난 뒤 검수를 요청해 주세요.");
      }
      const selfApproval = selfApprovalBlockedReason(user.id, action, row);
      if (selfApproval) throw new ApiError("FORBIDDEN", selfApproval);
      const note = comment?.trim() ?? "";
      if (action === "REQUEST_CHANGES" && !note) throw new ApiError("VALIDATION", "수정 요청에는 검수 의견을 적어야 합니다.");

      const now = new Date();
      await tx
        .update(contents)
        .set({
          status: t.to,
          updatedBy: user.id,
          updatedAt: now,
          version: row.version + 1,
          ...(action === "SUBMIT_FOR_REVIEW" ? { submittedBy: user.id } : {}),
          ...(action === "REQUEST_CHANGES" ? { reviewComment: note } : {}),
          ...(action === "PUBLISH" ? { publishedAt: now } : {}),
          ...(action === "UNPUBLISH" ? { publishedAt: null } : {}),
        })
        .where(eq(contents.id, id));
      await writeAudit(
        tx,
        user,
        "CONTENT_STATUS_CHANGED",
        "CONTENT",
        id,
        `${CONTENT_STATUS_LABELS[row.status]} → ${CONTENT_STATUS_LABELS[t.to]}${note ? ` (의견: ${note})` : ""}`,
      );
      return this.findContent(tx, id);
    });
  }

  async requestTts(user: AdminUser, id: string, segmentIds: string[]): Promise<ExerciseContent> {
    requirePermission(user, "tts:request");
    return this.db.transaction(async (tx) => {
      const row = await this.getContentOrThrow(tx, id, true);
      if (!canEditContent(user.role, row.status)) throw new ApiError("FORBIDDEN", "초안 또는 수정 요청 상태에서만 음성을 생성할 수 있습니다.");
      const targets = segmentIds.length
        ? await tx
            .select()
            .from(segments)
            .where(and(eq(segments.contentId, id), inArray(segments.id, segmentIds)))
        : [];
      if (targets.length === 0) throw new ApiError("VALIDATION", "음성을 생성할 구간을 선택해 주세요.");
      const now = new Date();
      for (const s of targets) {
        await tx
          .update(segments)
          .set({ ttsStatus: "GENERATING", ttsAudioUrl: null, ttsGeneratedForText: null, ttsFailureReason: null, ttsRequestedAt: now, ttsPendingText: s.voiceGuide })
          .where(eq(segments.id, s.id));
      }
      await tx.update(contents).set({ updatedAt: now }).where(eq(contents.id, id));
      const orders = targets.map((s) => `${s.position}구간`).sort((a, b) => parseInt(a) - parseInt(b));
      await writeAudit(tx, user, "TTS_REQUESTED", "CONTENT", id, `음성 생성 요청: ${orders.join(", ")}`);
      return this.findContent(tx, id);
    });
  }

  // ── AI 제작 작업 ──

  async listJobs(user: AdminUser): Promise<ContentJob[]> {
    requirePermission(user, "job:read");
    return loadJobs(this.db, this.config);
  }

  async createJob(user: AdminUser, input: { videoId: string; title: string; category: ContentJob["category"]; difficulty: ContentJob["difficulty"]; requestNote: string }): Promise<ContentJob> {
    requirePermission(user, "job:create");
    if (!input.title.trim()) throw new ApiError("VALIDATION", "운동 이름을 입력해 주세요.");
    const [video] = await this.db.select().from(videos).where(eq(videos.id, input.videoId));
    if (!video) throw new ApiError("NOT_FOUND", "영상을 찾을 수 없습니다. 먼저 영상을 올려 주세요.");
    const jobId = newId("j");
    await this.db.transaction(async (tx) => {
      await tx.insert(contentJobs).values({
        id: jobId,
        kind: "CREATE",
        title: input.title.trim(),
        category: input.category,
        difficulty: input.difficulty,
        requestNote: input.requestNote.trim(),
        videoId: video.id,
        requestedBy: user.id,
        // 개발용: 파일 이름에 fail이 들어가면 실패를 시연한다.
        simulateFailure: /fail/i.test(video.fileName),
      });
      await writeAudit(tx, user, "CONTENT_JOB_CREATED", "CONTENT_JOB", jobId, `제작 작업 생성: ${input.title.trim()} (${video.fileName}, ${Math.round(video.durationSec)}초)`);
    });
    return (await loadJobs(this.db, this.config, eq(contentJobs.id, jobId)))[0]!;
  }

  async retryJob(user: AdminUser, id: string): Promise<ContentJob> {
    requirePermission(user, "job:create");
    await this.db.transaction(async (tx) => {
      const [job] = await tx.select().from(contentJobs).where(eq(contentJobs.id, id)).for("update");
      if (!job) throw notFound("제작 작업");
      if (job.status !== "FAILED") throw new ApiError("VALIDATION", "실패한 작업만 다시 시도할 수 있습니다.");
      if (job.kind === "REANALYZE" && job.contentId && (await this.activeReanalysis(tx, job.contentId))) {
        throw new ApiError("CONFLICT", "이 콘텐츠는 이미 다시 분석이 진행 중입니다.");
      }
      const now = new Date();
      await tx
        .update(contentJobs)
        .set({ status: "QUEUED", progress: 0, failureReason: null, startedAt: now, simulateFailure: false, updatedAt: now })
        .where(eq(contentJobs.id, id));
      await writeAudit(tx, user, "CONTENT_JOB_RETRIED", "CONTENT_JOB", id, `제작 작업 재시도: ${job.title}`);
    });
    return (await loadJobs(this.db, this.config, eq(contentJobs.id, id)))[0]!;
  }

  // ── 감사 로그 ──

  async listAuditLogs(user: AdminUser, targetId?: string): Promise<AuditLog[]> {
    requirePermission(user, "audit:read");
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(targetId ? eq(auditLogs.targetId, targetId) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(500);
    return rows.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }));
  }
}

