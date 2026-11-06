import type { Id, ISODateString } from "./common";

export const EXERCISE_CATEGORIES = ["STRETCHING", "STRENGTH", "CARDIO", "BALANCE", "REHAB"] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const EXERCISE_CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  STRETCHING: "스트레칭",
  STRENGTH: "근력",
  CARDIO: "유산소",
  BALANCE: "균형",
  REHAB: "재활",
};

export const DIFFICULTIES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  BEGINNER: "초급",
  INTERMEDIATE: "중급",
  ADVANCED: "고급",
};

/** 단계별 음성 파일(TTS) 생성 상태 */
export const TTS_STATUSES = ["NONE", "REQUESTED", "GENERATING", "READY", "FAILED"] as const;
export type TtsStatus = (typeof TTS_STATUSES)[number];

export const TTS_STATUS_LABELS: Record<TtsStatus, string> = {
  NONE: "미생성",
  REQUESTED: "요청됨",
  GENERATING: "생성 중",
  READY: "생성 완료",
  FAILED: "실패",
};

export interface TtsAsset {
  status: TtsStatus;
  audioUrl: string | null;
  /** 음성 파일을 만들 때 사용한 안내문. 현재 안내문과 다르면 다시 생성해야 한다. */
  generatedForText: string | null;
  failureReason: string | null;
}

export interface ExerciseStep {
  id: Id;
  /** 1부터 시작하는 순서 */
  order: number;
  title: string;
  /** 동작 설명 (관리자 검수용, 사용자 화면의 텍스트 안내로도 사용) */
  instruction: string;
  /** 시각장애인용 음성 안내문. 시각적 표현 없이 몸의 감각과 방향으로 설명한다. */
  voiceGuide: string;
  durationSec: number;
  /** 반복 횟수. 시간 기반 동작이면 null */
  repetitions: number | null;
  restAfterSec: number;
  tts: TtsAsset;
}

export interface SourceVideo {
  fileName: string;
  sizeBytes: number;
  /** 객체 스토리지 URL. 업로드 전이거나 모의 환경이면 null */
  url: string | null;
}

/**
 * 콘텐츠 상태 흐름
 * DRAFT → IN_REVIEW → APPROVED → PUBLISHED
 *            ↓
 *   CHANGES_REQUESTED → (수정 후) IN_REVIEW
 * PUBLISHED → APPROVED (공개 중단), 어느 상태든 → ARCHIVED
 */
export const CONTENT_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: "초안",
  IN_REVIEW: "검수 중",
  CHANGES_REQUESTED: "수정 요청",
  APPROVED: "승인됨",
  PUBLISHED: "공개 중",
  ARCHIVED: "보관됨",
};

export interface ExerciseContent {
  id: Id;
  title: string;
  summary: string;
  category: ExerciseCategory;
  difficulty: Difficulty;
  tags: string[];
  /** 운동 전 주의사항 (통증·어지럼 시 중단 안내 등) */
  precautions: string[];
  steps: ExerciseStep[];
  sourceVideo: SourceVideo | null;
  status: ContentStatus;
  /** AI가 생성한 초안에서 시작했는지 여부 */
  aiGenerated: boolean;
  /** 관리자 내부 메모. 사용자 화면과 사용자 AI 답변에 절대 사용하지 않는다. */
  internalNote: string;
  /** 승인권자가 남긴 최근 검수 의견 */
  reviewComment: string | null;
  createdBy: Id;
  updatedBy: Id;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  publishedAt: ISODateString | null;
  /** 저장할 때마다 1씩 증가 (동시 수정 충돌 감지용) */
  version: number;
}

/** 사용자 앱·사용자 AI가 볼 수 있는 콘텐츠인지 판단한다. 공개 중인 것만 허용한다. */
export function isVisibleToUsers(content: Pick<ExerciseContent, "status">): boolean {
  return content.status === "PUBLISHED";
}

export function totalDurationSec(steps: Pick<ExerciseStep, "durationSec" | "restAfterSec">[]): number {
  return steps.reduce((sum, s) => sum + s.durationSec + s.restAfterSec, 0);
}

/** 사용자 운동 세션 상태 (설계 문서 3장). 세션 상태는 백엔드가 관리한다. */
export const EXERCISE_SESSION_STATES = [
  "READY",
  "INTRO",
  "PREPARATION",
  "IN_PROGRESS",
  "REST",
  "PAUSED",
  "COMPLETED",
  "STOPPED",
] as const;
export type ExerciseSessionState = (typeof EXERCISE_SESSION_STATES)[number];
