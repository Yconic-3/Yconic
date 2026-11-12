import type { Id } from "./common";
import type { ExerciseSegment } from "./exercise";

/**
 * 동작 단위 맞춤 안내 (docs/decisions/0008).
 * 안내 수준을 '운동 하나'가 아니라 '동작 하나(스쿼트, 팔굽혀펴기 …)' 단위로 정한다.
 * AI 분석기가 단계마다 어떤 동작인지 붙이고(segment.movements), 사용자가 그 동작을 아는지에 따라
 * 어느 영상에서든 그 단계를 배운 대로 짧게 또는 처음처럼 자세하게 안내한다.
 *
 * 사용자가 동작을 '안다'고 보는 경우 (학습 프로필):
 *  - 강사에게 배운 강의를 등록함 (내 강의 → 강의에 속한 동작)
 *  - "스쿼트 배웠어"처럼 직접 알림
 *  - 앱에서 그 동작 단계를 끝까지 따라 한 횟수가 PRACTICE_THRESHOLD 이상 (연습으로 익힘, 자동)
 */

export const MOVEMENT_IDS = [
  "squat",
  "lunge",
  "pushup",
  "wall_pushup",
  "plank",
  "bridge",
  "calf_raise",
  "hip_hinge",
  "crunch",
  "leg_raise",
  "march",
  "jumping_jack",
  "arm_raise",
  "neck_stretch",
  "side_stretch",
  "hamstring_stretch",
  "balance_stand",
  "ankle_circle",
  "breathing",
] as const;
export type MovementId = (typeof MOVEMENT_IDS)[number];

export interface MovementInfo {
  id: MovementId;
  label: string;
  /** 말이나 글에서 알아듣는 다른 이름 */
  aliases: readonly string[];
}

export const MOVEMENTS: readonly MovementInfo[] = [
  { id: "squat", label: "스쿼트", aliases: ["스쿼트", "앉았다 일어서기", "앉았다 일어나기"] },
  { id: "lunge", label: "런지", aliases: ["런지"] },
  { id: "pushup", label: "팔굽혀펴기", aliases: ["팔굽혀펴기", "푸시업", "푸쉬업"] },
  { id: "wall_pushup", label: "벽 팔굽혀펴기", aliases: ["벽 팔굽혀펴기", "벽 푸시업", "벽 밀기"] },
  { id: "plank", label: "플랭크", aliases: ["플랭크"] },
  { id: "bridge", label: "브릿지", aliases: ["브릿지", "브리지", "힙 브릿지", "엉덩이 들기"] },
  { id: "calf_raise", label: "뒤꿈치 들기", aliases: ["뒤꿈치 들기", "카프 레이즈", "까치발"] },
  { id: "hip_hinge", label: "힙 힌지", aliases: ["힙 힌지", "힙힌지", "데드리프트", "굿모닝"] },
  { id: "crunch", label: "크런치", aliases: ["크런치", "윗몸 일으키기"] },
  { id: "leg_raise", label: "다리 들기", aliases: ["다리 들기", "레그 레이즈", "사이드 레그 레이즈"] },
  { id: "march", label: "제자리 걷기", aliases: ["제자리 걷기", "제자리걸음"] },
  { id: "jumping_jack", label: "팔벌려뛰기", aliases: ["팔벌려뛰기", "점핑잭"] },
  { id: "arm_raise", label: "팔 들기·돌리기", aliases: ["팔 들기", "팔 돌리기", "어깨 돌리기", "프론트 레이즈"] },
  { id: "neck_stretch", label: "목 스트레칭", aliases: ["목 스트레칭", "목 늘리기"] },
  { id: "side_stretch", label: "옆구리 스트레칭", aliases: ["옆구리 스트레칭", "옆구리 늘리기"] },
  { id: "hamstring_stretch", label: "다리 뒤 스트레칭", aliases: ["다리 뒤 스트레칭", "햄스트링 스트레칭"] },
  { id: "balance_stand", label: "한 발 서기", aliases: ["한 발 서기", "한발 서기"] },
  { id: "ankle_circle", label: "발목 돌리기", aliases: ["발목 돌리기"] },
  { id: "breathing", label: "호흡", aliases: ["심호흡", "호흡"] },
];

export function movementLabel(id: MovementId): string {
  return MOVEMENTS.find((m) => m.id === id)?.label ?? id;
}

export function isMovementId(v: unknown): v is MovementId {
  return typeof v === "string" && (MOVEMENT_IDS as readonly string[]).includes(v);
}

/** 말에서 동작을 찾는다 ("스쿼트 배웠어" → squat). 긴 이름부터 본다 */
export function findMovementInText(text: string): MovementId | null {
  const flat = text.replace(/\s+/g, "");
  const candidates = MOVEMENTS.flatMap((m) => m.aliases.map((a) => ({ id: m.id, alias: a.replace(/\s+/g, "") }))).sort((a, b) => b.alias.length - a.alias.length);
  return candidates.find((c) => flat.includes(c.alias))?.id ?? null;
}

/** 이 횟수만큼 끝까지 따라 하면 그 동작을 익힌 것으로 본다 */
export const PRACTICE_THRESHOLD = 3;

/** 사용자가 동작을 알게 된 경로 */
export type MovementSource = "course" | "said" | "practice";

/** 사용자 한 사람이 한 동작에 대해 아는 것 */
export interface MovementKnowledge {
  movementId: MovementId;
  /** 강의로 배웠거나 직접 알렸으면 true. 연습만 했으면 false */
  declared: boolean;
  /** 배운 경로 (강의 이름이나 "직접") */
  sources: MovementSource[];
  /** 끝까지 따라 한 횟수 */
  practiceCount: number;
  /** 강사에게 배운 용어나 신호 (예: "엉덩이 뒤로 = 힙 힌지"). AI 맞춤 안내가 이 말을 쓴다 */
  terms: string;
}

export interface LearningProfile {
  movements: MovementKnowledge[];
}

export function knowsMovement(profile: LearningProfile | null, id: MovementId): boolean {
  const k = profile?.movements.find((m) => m.movementId === id);
  return !!k && (k.declared || k.practiceCount >= PRACTICE_THRESHOLD);
}

export type SegmentGuideLevel = "concise" | "detailed";

/**
 * 단계 하나의 안내 수준. 단계에 붙은 동작을 모두 알면 짧게, 하나라도 처음이면 자세하게.
 * 동작이 붙지 않은 단계(준비·휴식 등)나 로그인 전(profile 없음)은 자세하게.
 */
export function segmentGuideLevel(segment: Pick<ExerciseSegment, "movements">, profile: LearningProfile | null): SegmentGuideLevel {
  const ms = segment.movements ?? [];
  if (!profile || ms.length === 0) return "detailed";
  return ms.every((m) => knowsMovement(profile, m)) ? "concise" : "detailed";
}

/** 규칙으로 고른 단계 안내 (AI 맞춤 안내가 없을 때) */
export function ruleGuideText(segment: Pick<ExerciseSegment, "voiceGuide" | "conciseGuide" | "movements">, profile: LearningProfile | null): string {
  return segmentGuideLevel(segment, profile) === "concise" && segment.conciseGuide?.trim() ? segment.conciseGuide : segment.voiceGuide;
}

/**
 * 사용자 한 사람에게 맞춘 단계별 안내 (AI가 만들고 저장해 둔다).
 *   GET  /me/learning                          → LearningProfile
 *   PUT  /me/learning/movements/:movementId    SetMovementInput → LearningProfile
 *   POST /me/learning/practice                 RecordPracticeInput → LearningProfile
 *   GET  /me/guides/:exerciseId                → PersonalizedGuides  (공개 중인 운동만)
 */
export interface PersonalizedSegmentGuide {
  segmentId: Id;
  level: SegmentGuideLevel;
  text: string;
  /** 왜 이렇게 안내하는지 (예: "스쿼트를 배우셔서 짧게") */
  reason: string;
}

export interface PersonalizedGuides {
  exerciseId: Id;
  /** ai: Claude가 이 사용자에 맞게 다시 씀 / rule: 미리 만든 두 안내 중 고름 */
  generatedBy: "ai" | "rule";
  segments: PersonalizedSegmentGuide[];
}

export interface SetMovementInput {
  /** 배웠다고 알리면 true, 지우면 false */
  known: boolean;
  /** 강사에게 배운 용어 (선택) */
  terms?: string;
}

export interface RecordPracticeInput {
  movementIds: MovementId[];
}
