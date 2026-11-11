import type { ExerciseContent } from "@yconic/shared-types";
import { toPublishedExercise, UserApiError, type UserApi } from "./user-api";

/**
 * 백엔드 HTTP 구현.
 * 주의: 사용자용 엔드포인트는 아직 공통 타입에 정해져 있지 않다. 아래 경로는 임시이며,
 * 백엔드 담당자와 정한 뒤 `packages/shared-types`에 기록하고 여기를 맞춘다.
 * 인증 방식이 정해지면 토큰 전달도 여기에 넣는다.
 */
export function createHttpUserApi(baseUrl: string): UserApi {
  async function get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, { headers: { Accept: "application/json" } });
    } catch {
      throw new UserApiError("NETWORK", "서버에 연결할 수 없습니다.");
    }
    if (res.status === 404) throw new UserApiError("NOT_FOUND", "운동을 찾을 수 없습니다.");
    if (!res.ok) throw new UserApiError("NETWORK", `서버 오류가 발생했습니다. (${res.status})`);
    return (await res.json()) as T;
  }
  return {
    async listExercises(filter) {
      const params = new URLSearchParams();
      if (filter?.category) params.set("category", filter.category);
      if (filter?.keyword) params.set("keyword", filter.keyword);
      const query = params.toString();
      const list = await get<ExerciseContent[]>(`/exercises${query ? `?${query}` : ""}`);
      return list.map(toPublishedExercise);
    },
    async getExercise(id) {
      return toPublishedExercise(await get<ExerciseContent>(`/exercises/${encodeURIComponent(id)}`));
    },
    async getVideoPlaybackUrl(videoId) {
      const { url } = await get<{ url: string | null }>(`/videos/${encodeURIComponent(videoId)}/playback-url`);
      return url;
    },
  };
}
