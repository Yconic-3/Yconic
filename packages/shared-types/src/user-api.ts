import type { Id } from "./common";
import type { ExerciseCategory, ExerciseContent } from "./exercise";

/**
 * 사용자 API 요청·응답 형식. 사용자 화면(apps/web/src/user)과 백엔드(apps/api)가 이 형식으로 주고받는다.
 * 로그인 없이 쓸 수 있다. 공개 중(PUBLISHED)인 콘텐츠만, 아래 칸만 내보낸다.
 *   GET /exercises?category=&keyword=        → PublishedExercise[]
 *   GET /exercises/:id                       → PublishedExercise   (공개 중이 아니면 404)
 *   GET /videos/:id/playback-url             → { url }             (공개 중인 콘텐츠의 영상만)
 */

/**
 * 사용자에게 보여 줄 수 있는 콘텐츠 항목만 고른 모양.
 * 관리자 내부 메모·검수 의견·작성자 같은 칸은 사용자에게 넘어가지 않는다.
 */
export type PublishedExercise = Pick<
  ExerciseContent,
  "id" | "title" | "summary" | "category" | "difficulty" | "tags" | "precautions" | "video" | "segments"
>;

export interface ExerciseListFilter {
  category?: ExerciseCategory;
  /** 제목·요약·태그에서 찾을 말 */
  keyword?: string;
}

/** 콘텐츠에서 사용자에게 보여 줄 칸만 남긴다. 서버와 모의 구현이 같은 함수를 쓴다. */
export function toPublishedExercise(c: ExerciseContent): PublishedExercise {
  return {
    id: c.id,
    title: c.title,
    summary: c.summary,
    category: c.category,
    difficulty: c.difficulty,
    tags: [...c.tags],
    precautions: [...c.precautions],
    video: { ...c.video },
    segments: c.segments.map((s) => ({ ...s, tts: { ...s.tts } })),
  };
}

/** 분류·낱말 거르기. 낱말은 띄어쓰기를 무시하고 제목·요약·태그에서 찾는다. */
export function matchesExerciseFilter(e: Pick<PublishedExercise, "category" | "title" | "summary" | "tags">, filter: ExerciseListFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.category && e.category !== filter.category) return false;
  const keyword = filter.keyword?.replace(/\s+/g, "");
  if (keyword) {
    const haystack = [e.title, e.summary, ...e.tags].join(" ").replace(/\s+/g, "");
    if (!haystack.includes(keyword)) return false;
  }
  return true;
}

export interface UserPlaybackUrlResponse {
  videoId: Id;
  url: string | null;
}
