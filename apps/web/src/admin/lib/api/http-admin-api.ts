import type { AdminApiErrorBody, PlaybackUrlResponse } from "@yconic/shared-types";
import { API_UNREACHABLE_MESSAGE } from "@/lib/api-mode";
import { ChunkUploadError, uploadInChunks } from "@/lib/chunk-upload";
import type { VideoMetadata } from "../video";
import { AdminApiError, type AdminApi } from "./admin-api";

/**
 * 백엔드(apps/api) HTTP 구현.
 * 엔드포인트는 @yconic/shared-types 의 admin-api.ts 주석에 정리되어 있다.
 * 모든 요청에 로그인 토큰(getToken)을 Authorization 헤더로 붙인다.
 */
export function createHttpAdminApi(
  baseUrl: string,
  getToken: () => string | null,
  readVideoMetadata: (file: Blob) => Promise<VideoMetadata>,
): AdminApi {
  function authHeaders(): Record<string, string> {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function parseError(res: Response): Promise<AdminApiError> {
    const err = (await res.json().catch(() => null)) as AdminApiErrorBody | null;
    return new AdminApiError(err?.code ?? "UNKNOWN", err?.message ?? `요청 실패 (${res.status})`);
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
      throw new AdminApiError("UNKNOWN", API_UNREACHABLE_MESSAGE);
    }
    if (!res.ok) throw await parseError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  const qs = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return {
    uploadVideo: async (file, onProgress) => {
      // 영상 길이와 크기는 브라우저가 파일에서 읽어 함께 보낸다 (서버는 아직 영상을 열어 보지 않는다).
      let meta: VideoMetadata;
      try {
        meta = await readVideoMetadata(file);
      } catch (e) {
        throw new AdminApiError("VALIDATION", e instanceof Error ? e.message : "영상 정보를 읽을 수 없습니다.");
      }
      if (!(meta.durationSec > 0)) throw new AdminApiError("VALIDATION", "영상 길이를 읽을 수 없습니다. 다른 파일로 시도해 주세요.");
      // 작은 조각으로 나눠 올린다 (서버 앞 프록시가 큰 요청을 막아도 올라가게)
      try {
        return await uploadInChunks({ baseUrl: `${baseUrl}/admin`, headers: authHeaders, file, meta, onProgress });
      } catch (e) {
        if (e instanceof ChunkUploadError) throw new AdminApiError(e.code, e.message);
        throw e;
      }
    },
    getVideoPlaybackUrl: async (videoId) =>
      (await request<PlaybackUrlResponse>("GET", `/admin/videos/${encodeURIComponent(videoId)}/playback-url`)).url,
    deleteVideo: (videoId) => request("DELETE", `/admin/videos/${encodeURIComponent(videoId)}`),
    listContents: (f = {}) => request("GET", `/admin/contents${qs({ status: f.status, query: f.query })}`),
    getContent: (id) => request("GET", `/admin/contents/${encodeURIComponent(id)}`),
    updateContent: (id, input) => request("PATCH", `/admin/contents/${encodeURIComponent(id)}`, input),
    replaceContentVideo: (id, input) => request("PUT", `/admin/contents/${encodeURIComponent(id)}/video`, input),
    reanalyzeContent: (id, input) => request("POST", `/admin/contents/${encodeURIComponent(id)}/reanalyze`, input),
    changeContentStatus: (id, input) => request("POST", `/admin/contents/${encodeURIComponent(id)}/actions`, input),
    requestTts: (id, input) => request("POST", `/admin/contents/${encodeURIComponent(id)}/tts`, input),
    listJobs: () => request("GET", "/admin/content-jobs"),
    createJob: (input) => request("POST", "/admin/content-jobs", input),
    retryJob: (id) => request("POST", `/admin/content-jobs/${encodeURIComponent(id)}/retry`),
    listAuditLogs: (f = {}) => request("GET", `/admin/audit-logs${qs({ targetId: f.targetId })}`),
  };
}
