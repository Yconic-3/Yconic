import type { ExerciseCategory, ExerciseContent, ExerciseSegment } from "./exercise";

/**
 * 내 강의 (docs/decisions/0007).
 * 강사에게 배운 강의를 등록하면, 그 강의의 동작은 배운 용어로 짧게(concise), 처음 하는 동작은 자세하게(detailed) 안내한다.
 * 로그인하지 않았으면 모두 자세하게 안내한다.
 *   GET /me/courses          → MyCourses
 *   PUT /me/courses          MyCourses → MyCourses
 */

export const LEARNED_COURSE_IDS = ["lower", "core", "upper", "stretch"] as const;
export type CourseId = (typeof LEARNED_COURSE_IDS)[number];

export interface LearnedCourse {
  id: CourseId;
  label: string;
  /** 이 분류의 운동은 이 강의에 속한다 */
  categories: readonly ExerciseCategory[];
  /** 이 꼬리표가 붙은 운동은 이 강의에 속한다 */
  tags: readonly string[];
  /** 말로 고를 때 알아듣는 낱말 */
  words: readonly string[];
}

export const LEARNED_COURSES: readonly LearnedCourse[] = [
  { id: "lower", label: "하체 기초", categories: [], tags: ["하체", "다리"], words: ["하체", "스쿼트", "런지", "다리"] },
  { id: "core", label: "코어", categories: [], tags: ["코어", "복근"], words: ["코어", "플랭크", "복근"] },
  { id: "upper", label: "상체 기초", categories: [], tags: ["상체", "팔"], words: ["상체", "팔", "푸시업"] },
  { id: "stretch", label: "스트레칭·요가", categories: ["STRETCHING"], tags: ["스트레칭", "요가"], words: ["스트레칭", "요가"] },
];

export function courseLabel(id: CourseId): string {
  return LEARNED_COURSES.find((c) => c.id === id)?.label ?? id;
}

export interface MyCourses {
  courseIds: CourseId[];
}

/** 운동이 속한 강의. 어느 강의에도 속하지 않으면 null */
export function courseOfExercise(e: Pick<ExerciseContent, "category" | "tags">): CourseId | null {
  const course = LEARNED_COURSES.find((c) => c.categories.includes(e.category) || e.tags.some((t) => c.tags.includes(t)));
  return course?.id ?? null;
}

export type GuideLevel = "concise" | "detailed";

/** 배운 강의(learned)에 속한 운동이면 짧게. 로그인하지 않았으면 learned를 null로 넘긴다 */
export function guideLevelFor(e: Pick<ExerciseContent, "category" | "tags">, learned: readonly CourseId[] | null): GuideLevel {
  const course = courseOfExercise(e);
  return learned && course && learned.includes(course) ? "concise" : "detailed";
}

/** 이 수준에서 읽어 줄 단계 안내. 짧은 안내가 없으면 자세한 안내를 쓴다 */
export function guideTextOf(s: Pick<ExerciseSegment, "voiceGuide" | "conciseGuide">, level: GuideLevel): string {
  return level === "concise" && s.conciseGuide?.trim() ? s.conciseGuide : s.voiceGuide;
}

/** 사용자 화면에 보여 줄 안내 수준 이름 */
export function guideLevelLabel(level: GuideLevel): string {
  return level === "concise" ? "배운 동작, 간결" : "처음, 상세";
}
