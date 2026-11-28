import type { AdminApiErrorBody, AdminApiErrorCode, CreateUploadInput, UploadSession, VideoAsset } from "@yconic/shared-types";
import { API_UNREACHABLE_MESSAGE } from "./api-mode";
import type { VideoMetadata } from "./video-file";

/**
 * 영상 나눠 올리기 (shared-types/upload.ts, docs/decisions/0015).
 * 큰 영상을 서버가 알려 준 크기로 잘라 차례로 보낸다. 서버 앞 프록시가 한 번에 받는 크기를 작게 막아 둔 곳에서도 올릴 수 있다.
 * 사용자 화면(/me)과 관리자 화면(/admin)이 함께 쓴다.
 */

export class ChunkUploadError extends Error {
  constructor(
    public readonly code: AdminApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ChunkUploadOptions {
  /** 예: "/api/me", "/api/admin" */
  baseUrl: string;
  /** 요청마다 붙일 머리말 (로그인 토큰) */
  headers(): Record<string, string>;
  file: File;
  meta: VideoMetadata;
  onProgress?(fraction: number): void;
  /** 테스트에서 바꿔 끼운다 */
  fetchFn?: typeof fetch;
  /** 조각 하나를 다시 보내 보는 횟수와 기다리는 시간 */
  retries?: number;
  retryDelayMs?: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadInChunks(o: ChunkUploadOptions): Promise<VideoAsset> {
  const fetchFn = o.fetchFn ?? fetch;
  const retries = o.retries ?? 3;
  const retryDelayMs = o.retryDelayMs ?? 1000;

  /** 한 번 보낸다. 연결이 끊기거나 서버가 잠깐 못 받으면(5xx) retryable로 알린다 */
  async function send(method: string, path: string, init: { json?: unknown; bytes?: Blob } = {}): Promise<Response> {
    const headers: Record<string, string> = { ...o.headers() };
    let body: BodyInit | undefined;
    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.json);
    } else if (init.bytes) {
      headers["Content-Type"] = "application/octet-stream";
      body = init.bytes;
    }
    for (let attempt = 0; ; attempt++) {
      let res: Response | null = null;
      try {
        res = await fetchFn(`${o.baseUrl}${path}`, { method, headers, body });
      } catch {
        // 연결 실패: 아래에서 다시 보낸다
      }
      if (res && res.status < 500) return res;
      if (attempt >= retries) {
        if (res) return res;
        throw new ChunkUploadError("UNKNOWN", attempt === 0 ? API_UNREACHABLE_MESSAGE : "영상을 올리는 중 연결이 끊겼습니다. 다시 시도해 주세요.");
      }
      await wait(retryDelayMs * (attempt + 1));
    }
  }

  async function ok<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as AdminApiErrorBody | null;
      // 서버 앞 프록시가 막으면 본문이 JSON이 아니다
      const fallback = res.status === 413 ? "영상 조각이 너무 커서 서버가 받지 못했습니다. 관리자에게 알려 주세요." : `업로드 실패 (${res.status})`;
      throw new ChunkUploadError(err?.code ?? "UNKNOWN", err?.message ?? fallback);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  const input: CreateUploadInput = {
    fileName: o.file.name,
    mimeType: o.file.type,
    sizeBytes: o.file.size,
    durationSec: o.meta.durationSec,
    width: o.meta.width,
    height: o.meta.height,
  };
  const session = await ok<UploadSession>(await send("POST", "/uploads", { json: input }));
  const id = encodeURIComponent(session.id);
  try {
    o.onProgress?.(0);
    for (let i = 0; i < session.chunkCount; i++) {
      const start = i * session.chunkBytes;
      const end = Math.min(start + session.chunkBytes, o.file.size);
      await ok(await send("PUT", `/uploads/${id}/chunks/${i}`, { bytes: o.file.slice(start, end) }));
      o.onProgress?.(end / o.file.size);
    }
    return await ok<VideoAsset>(await send("POST", `/uploads/${id}/complete`));
  } catch (e) {
    // 실패하면 서버에 남은 조각을 지운다 (못 지워도 하루 뒤 서버가 지운다)
    void fetchFn(`${o.baseUrl}/uploads/${id}`, { method: "DELETE", headers: o.headers() }).catch(() => undefined);
    throw e;
  }
}
