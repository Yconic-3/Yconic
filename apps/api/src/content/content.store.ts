import { auditLogs, contentJobs, contents, segments, videos, type Database } from "@yconic/database";
import type { AdminUser, AuditAction, AuditLog, ContentJob, ExerciseContent, ExerciseSegment, VideoAsset } from "@yconic/shared-types";
import { asc, desc, inArray, type SQL } from "drizzle-orm";
import { newId } from "../common/ids";
import type { ApiConfig } from "../config";

type VideoRow = typeof videos.$inferSelect;
type ContentRow = typeof contents.$inferSelect;
type SegmentRow = typeof segments.$inferSelect;
type JobRow = typeof contentJobs.$inferSelect;

/** 트랜잭션 안에서도 같은 함수를 쓰기 위한 타입 */
export type Db = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

/** DB 행 ↔ 화면이 쓰는 모양(shared-types) 변환과, 여러 테이블을 묶어 읽는 일을 맡는다. */
export function videoUrl(config: ApiConfig, row: Pick<VideoRow, "storageKey">): string | null {
  return row.storageKey ? `${config.publicUrl}/media/videos/${encodeURIComponent(row.storageKey)}` : null;
}

export function toVideoAsset(config: ApiConfig, v: VideoRow): VideoAsset {
  return {
    id: v.id,
    fileName: v.fileName,
    mimeType: v.mimeType,
    sizeBytes: v.sizeBytes,
    durationSec: v.durationSec,
    width: v.width,
    height: v.height,
    url: videoUrl(config, v),
    uploadedBy: v.uploadedBy,
    uploadedAt: v.uploadedAt.toISOString(),
  };
}

export function toSegment(s: SegmentRow): ExerciseSegment {
  return {
    id: s.id,
    order: s.position,
    kind: s.kind,
    startSec: s.startSec,
    endSec: s.endSec,
    title: s.title,
    instruction: s.instruction,
    voiceGuide: s.voiceGuide,
    repetitions: s.repetitions,
    tts: { status: s.ttsStatus, audioUrl: s.ttsAudioUrl, generatedForText: s.ttsGeneratedForText, failureReason: s.ttsFailureReason },
  };
}

export function toContent(config: ApiConfig, c: ContentRow, v: VideoRow, segs: SegmentRow[]): ExerciseContent {
  return {
    id: c.id,
    title: c.title,
    summary: c.summary,
    category: c.category,
    difficulty: c.difficulty,
    tags: c.tags,
    precautions: c.precautions,
    video: toVideoAsset(config, v),
    segments: segs.map(toSegment),
    analysis: c.analysis ?? null,
    status: c.status,
    aiGenerated: c.aiGenerated,
    internalNote: c.internalNote,
    reviewComment: c.reviewComment,
    createdBy: c.createdBy,
    submittedBy: c.submittedBy,
    updatedBy: c.updatedBy,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    publishedAt: c.publishedAt?.toISOString() ?? null,
    version: c.version,
  };
}

export function toJob(config: ApiConfig, j: JobRow, v: VideoRow): ContentJob {
  return {
    id: j.id,
    kind: j.kind,
    title: j.title,
    category: j.category,
    difficulty: j.difficulty,
    requestNote: j.requestNote,
    video: toVideoAsset(config, v),
    status: j.status,
    progress: j.progress,
    failureReason: j.failureReason,
    contentId: j.contentId,
    requestedBy: j.requestedBy,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
    completedAt: j.completedAt?.toISOString() ?? null,
  };
}

/** 조건에 맞는 콘텐츠를 영상·구간과 함께 읽는다 (최근 수정 순). 쿼리는 3번이다. */
export async function loadContents(db: Db, config: ApiConfig, where?: SQL): Promise<ExerciseContent[]> {
  const rows = await db.select().from(contents).where(where).orderBy(desc(contents.updatedAt));
  if (rows.length === 0) return [];
  const videoRows = await db
    .select()
    .from(videos)
    .where(inArray(videos.id, [...new Set(rows.map((r) => r.videoId))]));
  const segRows = await db
    .select()
    .from(segments)
    .where(
      inArray(
        segments.contentId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(segments.contentId), asc(segments.position));
  const videoById = new Map(videoRows.map((v) => [v.id, v]));
  const segsByContent = new Map<string, SegmentRow[]>();
  for (const s of segRows) segsByContent.set(s.contentId, [...(segsByContent.get(s.contentId) ?? []), s]);
  return rows.map((c) => toContent(config, c, videoById.get(c.videoId)!, segsByContent.get(c.id) ?? []));
}

export async function loadJobs(db: Db, config: ApiConfig, where?: SQL): Promise<ContentJob[]> {
  const rows = await db.select().from(contentJobs).where(where).orderBy(desc(contentJobs.createdAt));
  if (rows.length === 0) return [];
  const videoRows = await db
    .select()
    .from(videos)
    .where(inArray(videos.id, [...new Set(rows.map((r) => r.videoId))]));
  const videoById = new Map(videoRows.map((v) => [v.id, v]));
  return rows.map((j) => toJob(config, j, videoById.get(j.videoId)!));
}

/** 기록을 남기는 실행자. 일반 회원(콘텐츠를 올린 사람)은 role이 null */
export type Actor = { id: string; name: string; role: AdminUser["role"] | null };

/** AI 작업기(content-worker)가 남기는 기록의 실행자 */
export const WORKER_ACTOR: Actor = { id: "content-worker", name: "content-worker", role: "EDITOR" };

export async function writeAudit(
  db: Db,
  actor: Actor,
  action: AuditAction,
  targetType: AuditLog["targetType"],
  targetId: string,
  summary: string,
): Promise<void> {
  await db.insert(auditLogs).values({
    id: newId("a"),
    action,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    targetType,
    targetId,
    summary,
  });
}
