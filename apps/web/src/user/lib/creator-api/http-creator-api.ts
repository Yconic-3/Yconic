import type { AdminApiErrorBody, VideoAsset } from "@yconic/shared-types";
import { API_UNREACHABLE_MESSAGE } from "@/lib/api-mode";
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
      return new Promise<VideoAsset>((resolve, reject) => {
        // fetch는 업로드 진행률을 주지 않으므로 XMLHttpRequest를 쓴다
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${baseUrl}/me/videos`);
        for (const [k, v] of Object.entries(authHeaders())) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress?.(e.loaded / e.total);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as VideoAsset);
            return;
          }
          let body: AdminApiErrorBody | null = null;
          try {
            body = JSON.parse(xhr.responseText) as AdminApiErrorBody;
          } catch {
            // 본문이 JSON이 아니면 상태 코드만 쓴다
          }
          reject(new CreatorApiError(body?.code ?? "UNKNOWN", body?.message ?? `업로드 실패 (${xhr.status})`));
        };
        xhr.onerror = () => reject(new CreatorApiError("UNKNOWN", "업로드 중 네트워크 오류가 났습니다."));
        const form = new FormData();
        form.append("durationSec", String(meta.durationSec));
        form.append("width", String(meta.width));
        form.append("height", String(meta.height));
        // 파일은 마지막에 넣는다 (서버가 앞의 칸을 먼저 읽는다)
        form.append("file", file);
        xhr.send(form);
      });
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
