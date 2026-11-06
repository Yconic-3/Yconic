import type { Id, ISODateString } from "./common";
import type { Difficulty, ExerciseCategory, VideoAsset } from "./exercise";

/** content-worker가 처리하는 콘텐츠 제작 작업의 단계 (설계 문서 7장) */
export const CONTENT_JOB_STATUSES = [
  "QUEUED",
  "ANALYZING_VIDEO",
  "EXTRACTING_STEPS",
  "GENERATING_SCRIPT",
  "GENERATING_TTS",
  "COMPLETED",
  "FAILED",
] as const;
export type ContentJobStatus = (typeof CONTENT_JOB_STATUSES)[number];

export const CONTENT_JOB_STATUS_LABELS: Record<ContentJobStatus, string> = {
  QUEUED: "대기 중",
  ANALYZING_VIDEO: "영상 분석 중",
  EXTRACTING_STEPS: "동작 구간 추출 중",
  GENERATING_SCRIPT: "안내문 생성 중",
  GENERATING_TTS: "음성 생성 중",
  COMPLETED: "완료",
  FAILED: "실패",
};

/**
 * 작업 종류
 * - CREATE: 새로 올린 영상으로 콘텐츠 초안을 만든다
 * - REANALYZE: 기존 콘텐츠의 영상을 다시 분석해 구간과 안내문을 새 결과로 바꾼다
 */
export const CONTENT_JOB_KINDS = ["CREATE", "REANALYZE"] as const;
export type ContentJobKind = (typeof CONTENT_JOB_KINDS)[number];

export const CONTENT_JOB_KIND_LABELS: Record<ContentJobKind, string> = {
  CREATE: "새 콘텐츠 제작",
  REANALYZE: "다시 분석",
};

/** 영상 하나를 분석하는 작업 */
export interface ContentJob {
  id: Id;
  kind: ContentJobKind;
  title: string;
  category: ExerciseCategory;
  difficulty: Difficulty;
  /** 관리자가 AI에게 전달하는 추가 요청 사항 */
  requestNote: string;
  video: VideoAsset;
  status: ContentJobStatus;
  /** 0~100 */
  progress: number;
  failureReason: string | null;
  /** CREATE: 완료 후 생성된 초안 ID (그 전에는 null) / REANALYZE: 다시 분석할 대상 콘텐츠 ID */
  contentId: Id | null;
  requestedBy: Id;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  completedAt: ISODateString | null;
}

export interface CreateContentJobInput {
  /** 먼저 올린 영상의 ID */
  videoId: Id;
  title: string;
  category: ExerciseCategory;
  difficulty: Difficulty;
  requestNote: string;
}
