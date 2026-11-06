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

/**
 * 관리자가 올린 운동 영상 파일. 콘텐츠의 본체다.
 * 실제 파일은 객체 스토리지(S3 호환)에 두고 여기에는 정보만 둔다.
 */
export interface VideoAsset {
  id: Id;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  width: number;
  height: number;
  /** 재생 주소. 스토리지 연결 전 예시 데이터는 null */
  url: string | null;
  uploadedBy: Id;
  uploadedAt: ISODateString;
}

/** 구간별 음성 파일(TTS) 생성 상태 */
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

export const SEGMENT_KINDS = ["INTRO", "EXERCISE", "REST", "OUTRO"] as const;
export type SegmentKind = (typeof SEGMENT_KINDS)[number];

export const SEGMENT_KIND_LABELS: Record<SegmentKind, string> = {
  INTRO: "준비",
  EXERCISE: "운동",
  REST: "휴식",
  OUTRO: "마무리",
};

/**
 * 영상 타임라인 위의 한 구간.
 * 사용자 앱은 영상을 재생하다가 구간이 시작되는 시각에 voiceGuide 음성을 들려준다.
 */
export interface ExerciseSegment {
  id: Id;
  /** 1부터 시작하는 순서. startSec 오름차순과 같아야 한다. */
  order: number;
  kind: SegmentKind;
  /** 영상에서의 시작 시각 (초) */
  startSec: number;
  /** 영상에서의 끝 시각 (초). 다음 구간의 시작보다 클 수 없다. */
  endSec: number;
  title: string;
  /** 영상에 보이는 동작 설명 (관리자 검수용) */
  instruction: string;
  /** 구간이 시작될 때 읽어 주는 시각장애인용 음성 안내문. 시각 표현 없이 몸의 감각과 방향으로 설명한다. */
  voiceGuide: string;
  /** 반복 횟수. 시간 기반 동작이면 null */
  repetitions: number | null;
  tts: TtsAsset;
}

export function segmentDurationSec(s: Pick<ExerciseSegment, "startSec" | "endSec">): number {
  return Math.max(0, s.endSec - s.startSec);
}

/** 어떤 분석기가 언제 이 영상을 분석했는지. 사람이 구간을 고친 뒤에도 출처로 남긴다. */
export interface AnalysisInfo {
  /** 예: "mock", "claude-vision", "content-worker" */
  provider: string;
  model: string | null;
  analyzedAt: ISODateString;
  summary: string;
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

/**
 * 운동 콘텐츠 = 영상 + 영상 위에 붙인 구간별 음성 안내.
 * 사용자 앱은 video를 재생하면서 segments의 시각에 맞춰 안내를 들려준다.
 */
export interface ExerciseContent {
  id: Id;
  title: string;
  summary: string;
  category: ExerciseCategory;
  difficulty: Difficulty;
  tags: string[];
  /** 운동 전 주의사항 (통증·어지럼 시 중단 안내 등). 영상 시작 전에 읽어 준다. */
  precautions: string[];
  video: VideoAsset;
  segments: ExerciseSegment[];
  analysis: AnalysisInfo | null;
  status: ContentStatus;
  /** AI 분석 결과에서 시작했는지 여부 */
  aiGenerated: boolean;
  /** 관리자 내부 메모. 사용자 화면과 사용자 AI 답변에 절대 사용하지 않는다. */
  internalNote: string;
  /** 승인권자가 남긴 최근 검수 의견 */
  reviewComment: string | null;
  createdBy: Id;
  /** 마지막으로 검수를 요청한 사람. 이 사람과 createdBy는 승인할 수 없다 (자기 승인 금지) */
  submittedBy: Id | null;
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
