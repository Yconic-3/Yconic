import { EXERCISE_CATEGORIES, EXERCISE_CATEGORY_LABELS, type ExerciseCategory, type Id } from "@yconic/shared-types";

/**
 * 사용자의 말(또는 글)을 앱이 할 일로 바꾼다.
 * 사용자 AI 에이전트(`apps/user-agent`)가 연결되기 전까지 쓰는 규칙 기반 해석기다.
 * 운동 정보는 앱이 가진 공개 콘텐츠 목록에서만 찾고, 없는 내용은 지어내지 않는다.
 */
export type Intent =
  | { type: "SAFETY" }
  | { type: "HOME" }
  | { type: "BACK" }
  | { type: "LIST"; category: ExerciseCategory | null; keyword: string | null }
  | { type: "OPEN"; exerciseId: Id; autoplay: boolean }
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "NEXT" }
  | { type: "PREVIOUS" }
  | { type: "REPEAT" }
  | { type: "SLOWER" }
  | { type: "FASTER" }
  | { type: "HELP" }
  | { type: "UNKNOWN" };

export interface IntentExercise {
  id: Id;
  title: string;
  tags: string[];
}

// 위험 신호는 다른 어떤 명령보다 먼저 본다 (설계 문서 10장).
const SAFETY_WORDS = ["아파", "아프", "아픕", "통증", "어지러", "어지럽", "숨이 차", "숨차", "숨이 안", "쓰러"];
const HOME_WORDS = ["홈", "처음으로", "첫 화면"];
const BACK_WORDS = ["이전 화면", "뒤로 가", "돌아가"];
const LIST_WORDS = ["찾아", "검색", "추천", "목록", "뭐 있", "뭐가 있", "어떤 운동", "무슨 운동"];
const PAUSE_WORDS = ["멈춰", "멈추", "정지", "일시", "그만", "스톱", "잠깐"];
const START_WORDS = ["시작", "재생", "계속", "플레이", "해줘", "해 줘", "할래"];
const NEXT_WORDS = ["다음"];
const PREVIOUS_WORDS = ["이전", "뒤로"];
const REPEAT_WORDS = ["다시", "반복", "한 번 더", "한번 더"];
const SLOWER_WORDS = ["느리게", "천천히"];
const FASTER_WORDS = ["빠르게", "빨리"];
const HELP_WORDS = ["도움", "어떻게 말", "뭐라고 말", "명령"];

/** 제목에서 운동을 구분하는 데 도움이 안 되는 말 */
const GENERIC_TITLE_WORDS = new Set(["운동", "하는", "하기", "잡고", "앉아서", "서서"]);

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function compact(text: string): string {
  return text.replace(/\s+/g, "");
}

function findCategory(text: string): ExerciseCategory | null {
  return EXERCISE_CATEGORIES.find((c) => text.includes(EXERCISE_CATEGORY_LABELS[c])) ?? null;
}

function findTag(text: string, exercises: IntentExercise[]): string | null {
  const tags = new Set(exercises.flatMap((e) => e.tags));
  // 긴 태그부터 본다 ("목"이 "목록"에 걸리지 않도록 한 글자 태그는 낱말로 떨어져 있을 때만 인정)
  const words = text.split(/\s+/);
  for (const tag of [...tags].sort((a, b) => b.length - a.length)) {
    if (tag.length >= 2 ? text.includes(tag) : words.includes(tag)) return tag;
  }
  return null;
}

/** 말에 들어 있는 제목 낱말 수로 운동을 고른다. 하나로 좁혀지지 않으면 null */
function findExercise(text: string, exercises: IntentExercise[]): IntentExercise | null {
  const flat = compact(text);
  let best: IntentExercise | null = null;
  let bestScore = 0;
  let tie = false;
  for (const e of exercises) {
    let score = 0;
    if (flat.includes(compact(e.title))) score += 10;
    for (const word of e.title.split(/\s+/)) {
      if (word.length >= 2 && !GENERIC_TITLE_WORDS.has(word) && flat.includes(word)) score += 1;
    }
    if (score > bestScore) {
      best = e;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  return bestScore > 0 && !tie ? best : null;
}

export function parseIntent(raw: string, exercises: IntentExercise[]): Intent {
  const text = raw.trim();
  if (!text) return { type: "UNKNOWN" };

  if (hasAny(text, SAFETY_WORDS)) return { type: "SAFETY" };
  if (hasAny(text, HOME_WORDS)) return { type: "HOME" };
  if (hasAny(text, BACK_WORDS)) return { type: "BACK" };
  if (hasAny(text, HELP_WORDS)) return { type: "HELP" };

  if (hasAny(text, LIST_WORDS)) {
    return { type: "LIST", category: findCategory(text), keyword: findTag(text, exercises) };
  }

  const exercise = findExercise(text, exercises);
  if (exercise) return { type: "OPEN", exerciseId: exercise.id, autoplay: hasAny(text, START_WORDS) };

  // 속도 조절은 "다시 천천히"처럼 다른 말과 섞여도 속도로 본다.
  if (hasAny(text, SLOWER_WORDS)) return { type: "SLOWER" };
  if (hasAny(text, FASTER_WORDS)) return { type: "FASTER" };
  if (hasAny(text, PAUSE_WORDS)) return { type: "PAUSE" };
  if (hasAny(text, NEXT_WORDS)) return { type: "NEXT" };
  if (hasAny(text, PREVIOUS_WORDS)) return { type: "PREVIOUS" };
  if (hasAny(text, REPEAT_WORDS)) return { type: "REPEAT" };
  if (hasAny(text, START_WORDS)) return { type: "START" };

  // 분류나 태그만 말한 경우 ("스트레칭", "하체")는 목록으로 본다.
  const category = findCategory(text);
  const keyword = findTag(text, exercises);
  if (category || keyword) return { type: "LIST", category, keyword };

  return { type: "UNKNOWN" };
}
