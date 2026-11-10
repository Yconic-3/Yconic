import type { ExerciseCategory, ExerciseContent, Id } from "@yconic/shared-types";

/**
 * 사용자에게 보여 줄 수 있는 콘텐츠 항목만 고른 모양.
 * 새 타입이 아니라 공통 타입 ExerciseContent에서 필요한 칸만 뽑은 것이다.
 * 관리자 내부 메모·검수 의견·작성자 같은 칸은 사용자 앱으로 넘어오지 않는다.
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

/**
 * 사용자 앱이 사용하는 데이터 접근 인터페이스.
 * 화면 코드는 이 인터페이스만 사용하고, 모의 구현과 HTTP 구현은 바꿔 끼울 수 있다.
 * 공개 중(PUBLISHED)인 콘텐츠만 돌려준다.
 */
export interface UserApi {
  listExercises(filter?: ExerciseListFilter): Promise<PublishedExercise[]>;
  getExercise(id: Id): Promise<PublishedExercise>;
  /** 재생 가능한 영상 주소. 파일이 없는 예시 데이터면 null */
  getVideoPlaybackUrl(videoId: Id): Promise<string | null>;
}

export class UserApiError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "NETWORK",
    message: string,
  ) {
    super(message);
    this.name = "UserApiError";
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "알 수 없는 오류가 발생했습니다.";
}

/** 콘텐츠에서 사용자에게 보여 줄 칸만 남긴다. */
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

export function matchesFilter(e: PublishedExercise, filter: ExerciseListFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.category && e.category !== filter.category) return false;
  const keyword = filter.keyword?.replace(/\s+/g, "");
  if (keyword) {
    const haystack = [e.title, e.summary, ...e.tags].join(" ").replace(/\s+/g, "");
    if (!haystack.includes(keyword)) return false;
  }
  return true;
}
