import type { PublishedExercise, UserPlaybackUrlResponse } from "@yconic/shared-types";
import { API_UNREACHABLE_MESSAGE } from "@/lib/api-mode";
import { UserApiError, type UserApi } from "./user-api";

/**
 * 백엔드(apps/api) HTTP 구현. 로그인 없이 쓴다.
 * 엔드포인트는 @yconic/shared-types 의 user-api.ts 주석에 정리되어 있다.
 */
export function createHttpUserApi(baseUrl: string): UserApi {
  async function get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, { headers: { Accept: "application/json" } });
    } catch {
      throw new UserApiError("NETWORK", API_UNREACHABLE_MESSAGE);
    }
    if (res.status === 404) throw new UserApiError("NOT_FOUND", "운동을 찾을 수 없습니다.");
    if (!res.ok) throw new UserApiError("NETWORK", `서버 오류가 발생했습니다. (${res.status})`);
    return (await res.json()) as T;
  }
  return {
    listExercises(filter) {
      const params = new URLSearchParams();
      if (filter?.category) params.set("category", filter.category);
      if (filter?.keyword) params.set("keyword", filter.keyword);
      const query = params.toString();
      return get<PublishedExercise[]>(`/exercises${query ? `?${query}` : ""}`);
    },
    getExercise(id) {
      return get<PublishedExercise>(`/exercises/${encodeURIComponent(id)}`);
    },
    async getVideoPlaybackUrl(videoId) {
      return (await get<UserPlaybackUrlResponse>(`/videos/${encodeURIComponent(videoId)}/playback-url`)).url;
    },
  };
}
