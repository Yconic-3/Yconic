import { contentJobs, videos } from "@yconic/database";
import type { ContentJob, VideoAsset } from "@yconic/shared-types";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { ApiError } from "../common/errors";
import { newId } from "../common/ids";
import { videosDir, type ApiConfig } from "../config";
import { toVideoAsset, writeAudit, type Actor, type Db } from "./content.store";

/**
 * 관리자 화면과 회원 콘텐츠 올리기가 함께 쓰는 일: 영상 저장, 새 콘텐츠 제작 작업 만들기.
 * 권한 검사는 부르는 쪽(AdminService, MeService)이 먼저 한다.
 */

export interface UploadedVideoFile {
  /** 저장소에 저장된 파일 이름 */
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export type VideoMeta = { durationSec: number; width: number; height: number };

/** 받은 영상 파일을 기록한다. 실패하면 저장된 파일을 지운다 */
export async function saveUploadedVideo(
  db: Db,
  config: ApiConfig,
  uploaderId: string,
  file: UploadedVideoFile | undefined,
  meta: VideoMeta | Error,
  check: () => void = () => undefined,
): Promise<VideoAsset> {
  try {
    check();
    if (!file) throw new ApiError("VALIDATION", "영상 파일을 함께 보내 주세요.");
    if (!file.mimetype.startsWith("video/")) throw new ApiError("VALIDATION", "영상 파일만 올릴 수 있습니다.");
    if (meta instanceof Error) throw meta;
    const [row] = await db
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
        uploadedBy: uploaderId,
      })
      .returning();
    return toVideoAsset(config, row!);
  } catch (e) {
    if (file) await rm(join(videosDir(config), file.filename), { force: true });
    throw e;
  }
}

export interface NewJobInput {
  title: string;
  category: ContentJob["category"];
  difficulty: ContentJob["difficulty"];
  requestNote: string;
}

/** 새 콘텐츠 제작 작업을 큐에 넣는다. 작업기가 끝나면 이 실행자가 만든 초안이 생긴다 */
export async function insertCreateJob(
  tx: Db,
  actor: Actor,
  input: NewJobInput,
  video: typeof videos.$inferSelect,
): Promise<string> {
  if (!input.title.trim()) throw new ApiError("VALIDATION", "운동 이름을 입력해 주세요.");
  const jobId = newId("j");
  await tx.insert(contentJobs).values({
    id: jobId,
    kind: "CREATE",
    title: input.title.trim(),
    category: input.category,
    difficulty: input.difficulty,
    requestNote: input.requestNote.trim(),
    videoId: video.id,
    requestedBy: actor.id,
    // 개발용: 파일 이름에 fail이 들어가면 실패를 시연한다.
    simulateFailure: /fail/i.test(video.fileName),
  });
  await writeAudit(tx, actor, "CONTENT_JOB_CREATED", "CONTENT_JOB", jobId, `제작 작업 생성: ${input.title.trim()} (${video.fileName}, ${Math.round(video.durationSec)}초)`);
  return jobId;
}
