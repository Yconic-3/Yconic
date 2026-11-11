import { matchesExerciseFilter, type ExerciseListFilter, type Id, type PublishedExercise } from "@yconic/shared-types";

// 사용자에게 보여 줄 칸과 거르기 규칙은 공통 타입에 있다 (서버와 같은 규칙).
export { toPublishedExercise, type ExerciseListFilter, type PublishedExercise } from "@yconic/shared-types";

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

/** 이전 이름. 공통 타입의 matchesExerciseFilter와 같다. */
export const matchesFilter = matchesExerciseFilter;
