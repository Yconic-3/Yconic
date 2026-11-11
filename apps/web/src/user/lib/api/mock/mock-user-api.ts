import { isVisibleToUsers, type ExerciseContent } from "@yconic/shared-types";
import { matchesFilter, toPublishedExercise, UserApiError, type UserApi } from "../user-api";

/**
 * 백엔드가 준비되기 전에 쓰는 모의 구현.
 * 실제 백엔드와 같은 규칙으로, 공개 중인 콘텐츠만 사용자에게 필요한 칸만 남겨 돌려준다.
 *
 * @param source 콘텐츠 목록 또는 매번 최신 목록을 읽어 오는 함수.
 *   한 웹앱 안에서는 관리자 화면과 같은 모의 저장소를 읽어서, 관리자가 공개한 영상이 바로 보인다.
 * @param getStoredVideoUrl 관리자가 올린 영상 파일처럼 주소가 없는 영상의 재생 주소를 찾는다 (선택).
 */
export function createMockUserApi(
  source: ExerciseContent[] | (() => ExerciseContent[]),
  getStoredVideoUrl?: (videoId: string) => Promise<string | null>,
): UserApi {
  const read = typeof source === "function" ? source : () => source;
  const published = () => read().filter(isVisibleToUsers).map(toPublishedExercise);
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
      if (!found) return null;
      if (found.video.url) return found.video.url;
      return getStoredVideoUrl ? getStoredVideoUrl(videoId).catch(() => null) : null;
    },
  };
}
