import type { AdminApiErrorBody } from "@yconic/shared-types";
import { API_UNREACHABLE_MESSAGE } from "@/lib/api-mode";
import { ChunkUploadError, uploadInChunks } from "@/lib/chunk-upload";
import type { VideoMetadata } from "@/lib/video-file";
import { CreatorApiError, type CreatorApi } from "./creator-api";

/** 백엔드(apps/api)의 /me 주소를 부른다. 모든 요청에 로그인 토큰을 붙인다 */
export function createHttpCreatorApi(
  baseUrl: string,
  getToken: () => string | null,
  readVideoMetadata: (file: Blob) => Promise<VideoMetadata>,
): CreatorApi {
  function authHeaders(): Record<string, string> {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...authHeaders() },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new CreatorApiError("UNKNOWN", API_UNREACHABLE_MESSAGE);
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as AdminApiErrorBody | null;
      throw new CreatorApiError(err?.code ?? "UNKNOWN", err?.message ?? `요청 실패 (${res.status})`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  const enc = encodeURIComponent;
  return {
    async uploadVideo(file, onProgress) {
      // 영상 길이와 크기는 브라우저가 파일에서 읽어 함께 보낸다
      let meta: VideoMetadata;
      try {
        meta = await readVideoMetadata(file);
      } catch (e) {
        throw new CreatorApiError("VALIDATION", e instanceof Error ? e.message : "영상 정보를 읽을 수 없습니다.");
      }
      if (!(meta.durationSec > 0)) throw new CreatorApiError("VALIDATION", "영상 길이를 읽을 수 없습니다. 다른 파일로 시도해 주세요.");
      // 작은 조각으로 나눠 올린다 (서버 앞 프록시가 큰 요청을 막아도 올라가게)
      try {
        return await uploadInChunks({ baseUrl: `${baseUrl}/me`, headers: authHeaders, file, meta, onProgress });
      } catch (e) {
        if (e instanceof ChunkUploadError) throw new CreatorApiError(e.code, e.message);
        throw e;
      }
    },
    deleteVideo: (videoId) => request("DELETE", `/me/videos/${enc(videoId)}`),
    createJob: (input) => request("POST", "/me/content-jobs", input),
    getJob: (jobId) => request("GET", `/me/content-jobs/${enc(jobId)}`),
    listMyContents: () => request("GET", "/me/contents"),
    getMyContent: (contentId) => request("GET", `/me/contents/${enc(contentId)}`),
    updateMyGuides: (contentId, input) => request("PATCH", `/me/contents/${enc(contentId)}/guides`, input),
    submitMyContent: (contentId, input) => request("POST", `/me/contents/${enc(contentId)}/submit`, input),
  };
}
