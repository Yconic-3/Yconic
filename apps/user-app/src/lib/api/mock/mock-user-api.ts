import { isVisibleToUsers, type ExerciseContent } from "@yconic/shared-types";
import { matchesFilter, toPublishedExercise, UserApiError, type UserApi } from "../user-api";

/**
 * 백엔드가 준비되기 전에 쓰는 모의 구현.
 * 실제 백엔드와 같은 규칙으로, 공개 중인 콘텐츠만 사용자에게 필요한 칸만 남겨 돌려준다.
 */
export function createMockUserApi(contents: ExerciseContent[]): UserApi {
  const published = () => contents.filter(isVisibleToUsers).map(toPublishedExercise);
  return {
    async listExercises(filter) {
      return published().filter((e) => matchesFilter(e, filter));
    },
    async getExercise(id) {
      const found = published().find((e) => e.id === id);
      if (!found) throw new UserApiError("NOT_FOUND", "운동을 찾을 수 없습니다.");
      return found;
    },
    async getVideoPlaybackUrl(videoId) {
      const found = published().find((e) => e.video.id === videoId);
      return found?.video.url ?? null;
    },
  };
}
