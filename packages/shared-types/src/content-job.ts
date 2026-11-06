import type { Id, ISODateString } from "./common";
import type { Difficulty, ExerciseCategory, SourceVideo } from "./exercise";

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
  EXTRACTING_STEPS: "동작 단계 추출 중",
  GENERATING_SCRIPT: "설명문 생성 중",
  GENERATING_TTS: "음성 생성 중",
  COMPLETED: "완료",
  FAILED: "실패",
};

export interface ContentJob {
  id: Id;
  title: string;
  category: ExerciseCategory;
  difficulty: Difficulty;
  /** 관리자가 AI에게 전달하는 추가 요청 사항 */
  requestNote: string;
  sourceVideo: SourceVideo;
  status: ContentJobStatus;
  /** 0~100 */
  progress: number;
  failureReason: string | null;
  /** 작업이 완료되어 생성된 콘텐츠 초안 ID */
  contentId: Id | null;
  requestedBy: Id;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  completedAt: ISODateString | null;
}

export interface CreateContentJobInput {
  title: string;
  category: ExerciseCategory;
  difficulty: Difficulty;
  requestNote: string;
  sourceVideo: SourceVideo;
}
