import { DIFFICULTY_LABELS, EXERCISE_CATEGORY_LABELS, type Difficulty, type ExerciseCategory } from "@yconic/shared-types";

/**
 * 운동 영상 검색. 검색창에 쓴 말이나 말로 한 검색어를 낱말로 나눠, 제목·요약·꼬리표·분류·난이도에서 찾는다.
 * 많이 맞을수록, 제목에 맞을수록 앞에 둔다.
 */

export interface Searchable {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  category: ExerciseCategory;
  difficulty: Difficulty;
}

/** 검색어에서 빼는 말 ("하체 운동 찾아줘" → "하체") */
const FILLER_WORDS = new Set([
  "운동",
  "영상",
  "동영상",
  "찾아줘",
  "찾아",
  "찾기",
  "검색",
  "검색해줘",
  "보여줘",
  "보여",
  "알려줘",
  "해줘",
  "하는",
  "할",
  "수",
  "있는",
  "있어",
  "좀",
  "추천",
  "추천해줘",
  "뭐",
  "어떤",
]);

/** 낱말 끝의 조사 ("하체를", "목에") */
const PARTICLES = /(을|를|이|가|은|는|에|에서|으로|로|와|과|도|만)$/;

function compact(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 검색어를 찾을 낱말로 나눈다. 남는 말이 없으면 빈 배열 */
export function searchTerms(query: string): string[] {
  const words = query
    .replace(/[?.,!"'“”]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => (w.length > 2 ? w.replace(PARTICLES, "") : w))
    .filter((w) => w && !FILLER_WORDS.has(w));
  return [...new Set(words)];
}

/** 검색어에 맞는 운동을 맞는 정도 순으로. 낱말이 없으면 전부 그대로 */
export function searchExercises<T extends Searchable>(list: T[], query: string): T[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return list;
  const scored = list.map((e, index) => {
    const title = compact(e.title);
    const rest = compact([e.summary, ...e.tags, EXERCISE_CATEGORY_LABELS[e.category], DIFFICULTY_LABELS[e.difficulty]].join(" "));
    let score = 0;
    for (const t of terms) {
      const c = compact(t);
      if (title.includes(c)) score += 3;
      else if (rest.includes(c)) score += 1;
    }
    return { e, score, index };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.e);
}

/** 주소에 쓸 검색 경로 */
export function searchPath(query: string): string {
  return `/search?q=${encodeURIComponent(query.trim())}`;
}
