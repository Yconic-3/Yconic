import type { AdminApiErrorBody, PlaybackUrlResponse, VideoAsset } from "@yconic/shared-types";
import { API_UNREACHABLE_MESSAGE } from "@/lib/api-mode";
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
      return new Promise<VideoAsset>((resolve, reject) => {
        // fetch는 업로드 진행률을 주지 않으므로 XMLHttpRequest를 쓴다.
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${baseUrl}/admin/videos`);
        for (const [k, v] of Object.entries(authHeaders())) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress?.(e.loaded / e.total);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as VideoAsset);
          } else {
            let body: AdminApiErrorBody | null = null;
            try {
              body = JSON.parse(xhr.responseText) as AdminApiErrorBody;
            } catch {
              // 본문이 JSON이 아니면 상태 코드만 사용
            }
            reject(new AdminApiError(body?.code ?? "UNKNOWN", body?.message ?? `업로드 실패 (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new AdminApiError("UNKNOWN", "업로드 중 네트워크 오류가 발생했습니다."));
        const form = new FormData();
        form.append("durationSec", String(meta.durationSec));
        form.append("width", String(meta.width));
        form.append("height", String(meta.height));
        // 파일은 마지막에 넣는다 (서버가 앞의 칸을 먼저 읽는다)
        form.append("file", file);
        xhr.send(form);
      });
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
