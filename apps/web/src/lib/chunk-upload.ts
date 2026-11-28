import type { AdminApiErrorBody, AdminApiErrorCode, CreateUploadInput, UploadSession, UploadStatus, VideoAsset } from "@yconic/shared-types";
import { API_UNREACHABLE_MESSAGE } from "./api-mode";
import type { VideoMetadata } from "./video-file";

/**
 * 영상 나눠 올리기 (shared-types/upload.ts, docs/decisions/0015, 0022).
 * 큰 영상을 서버가 알려 준 크기로 잘라 보낸다. 서버 앞 프록시가 한 번에 받는 크기를 작게 막아 둔 곳에서도 올릴 수 있다.
 * - 여러 조각을 동시에 보낸다 (조각은 어떤 순서로 가도 서버가 번호 순서로 합친다).
 * - 서버가 직접 받을 주소를 알려 주면 그쪽으로 보낸다. 큰 영상이 중간 프록시(Vercel)의 전송량 한도를 쓰지 않는다.
 *   직접 보내지 못하면 시작한 주소로 돌아간다.
 * - 끊기면 받은 데서 이어 올린다. 같은 파일을 다시 고르면 빠진 조각만 보낸다 (받은 조각은 서버에 하루 남는다).
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

/** 올리던 것을 기억해 두는 곳 (이어 올리기). 기본은 브라우저 저장소 */
export interface ResumeStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface ChunkUploadOptions {
  /** 예: "/api/me", "/api/admin" */
  baseUrl: string;
  /** 요청마다 붙일 머리말 (로그인 토큰) */
  headers(): Record<string, string>;
  file: File;
  meta: VideoMetadata;
  onProgress?(fraction: number): void;
  /** 동시에 보내는 조각 수 */
  concurrency?: number;
  /** 테스트에서 바꿔 끼운다 */
  fetchFn?: typeof fetch;
  resumeStore?: ResumeStore;
  /** 조각 하나를 다시 보내 보는 횟수와 기다리는 시간 */
  retries?: number;
  retryDelayMs?: number;
}

/** 동시에 보내는 조각 수. 브라우저는 한 서버에 6개까지 함께 연결한다. 다른 요청이 막히지 않게 조금 남긴다 */
export const UPLOAD_CONCURRENCY = 4;
const RESUME_PREFIX = "yconic.upload.";
export const INTERRUPTED_MESSAGE = "영상을 올리는 중 연결이 끊겼습니다. 같은 파일을 다시 올리면 받은 데서 이어 올립니다.";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function browserStore(): ResumeStore {
  const use = <T>(work: (s: Storage) => T, fallback: T): T => {
    try {
      return work(window.localStorage);
    } catch {
      return fallback;
    }
  };
  return {
    get: (key) => use((s) => s.getItem(RESUME_PREFIX + key), null),
    set: (key, value) => use((s) => s.setItem(RESUME_PREFIX + key, value), undefined),
    remove: (key) => use((s) => s.removeItem(RESUME_PREFIX + key), undefined),
  };
}

/** 연결이 끊겨 보내지 못했다 (서버가 거절한 것과 구분한다) */
class Unreachable extends Error {}

export async function uploadInChunks(o: ChunkUploadOptions): Promise<VideoAsset> {
  const fetchFn = o.fetchFn ?? fetch;
  const retries = o.retries ?? 3;
  const retryDelayMs = o.retryDelayMs ?? 1000;
  const concurrency = Math.max(1, o.concurrency ?? UPLOAD_CONCURRENCY);
  const store = o.resumeStore ?? browserStore();
  // 같은 파일인지 알아보는 표시 (이름·크기·고친 시각). 주소(회원/관리자)가 다르면 다른 올리기다
  const resumeKey = `${o.baseUrl}|${o.file.name}|${o.file.size}|${o.file.lastModified}`;

  /**
   * 한 번 보낸다. 연결이 끊기거나 서버가 잠깐 못 받으면(5xx) 다시 보내고, 끝내 안 되면 Unreachable.
   * giveUpIfUnreachable: 처음부터 연결이 안 되면 다시 보내지 않고 바로 Unreachable (직접 보내는 주소가 막혀 있는지 빨리 알려고).
   */
  async function send(method: string, url: string, init: { json?: unknown; bytes?: Blob } = {}, tries = retries, giveUpIfUnreachable = false): Promise<Response> {
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
        res = await fetchFn(url, { method, headers, body });
      } catch {
        // 연결 실패: 아래에서 다시 보낸다
      }
      if (res && res.status < 500) return res;
      // 서버가 계속 못 받는 것(5xx)도 끊긴 것으로 본다: 올리던 것을 지우지 않고 다음에 이어 올린다
      if (attempt >= tries || (!res && giveUpIfUnreachable)) throw new Unreachable();
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

  // ── 이어 올릴 것이 있는지 본다. 없으면 새로 시작한다 ──
  let session: UploadSession | null = null;
  const done = new Set<number>();
  const savedId = store.get(resumeKey);
  if (savedId) {
    const res = await send("GET", `${o.baseUrl}/uploads/${encodeURIComponent(savedId)}`, {}, 0).catch(() => null);
    if (res?.ok) {
      const status = (await res.json()) as UploadStatus;
      if (status.sizeBytes === o.file.size) {
        session = status;
        status.received.forEach((i) => done.add(i));
      }
    }
    // 서버에 남아 있지 않으면(하루가 지났거나 끝났다) 처음부터 올린다. 서버에 묻지 못했으면 기억은 그대로 둔다
    if (!session && res) store.remove(resumeKey);
  }
  if (!session) {
    const input: CreateUploadInput = {
      fileName: o.file.name,
      mimeType: o.file.type,
      sizeBytes: o.file.size,
      durationSec: o.meta.durationSec,
      width: o.meta.width,
      height: o.meta.height,
    };
    let res: Response;
    try {
      res = await send("POST", `${o.baseUrl}/uploads`, { json: input });
    } catch {
      throw new ChunkUploadError("UNKNOWN", API_UNREACHABLE_MESSAGE);
    }
    session = await ok<UploadSession>(res);
    store.set(resumeKey, session.id);
  }

  const { id, chunkBytes, chunkCount } = session;
  // 시작한 주소(프록시를 거친다)와, 서버가 알려 준 직접 보내는 주소
  const viaProxy = `${o.baseUrl}/uploads/${encodeURIComponent(id)}`;
  let target = session.uploadUrl ?? viaProxy;

  const sizeOf = (i: number) => Math.min(chunkBytes, o.file.size - i * chunkBytes);
  let sentBytes = [...done].reduce((sum, i) => sum + sizeOf(i), 0);
  o.onProgress?.(o.file.size ? sentBytes / o.file.size : 0);

  async function putChunk(i: number): Promise<void> {
    const bytes = o.file.slice(i * chunkBytes, i * chunkBytes + sizeOf(i));
    let res: Response;
    try {
      // 직접 보내는 주소에 연결이 안 되면 오래 기다리지 않고 프록시 주소로 돌아간다
      res = await send("PUT", `${target}/chunks/${i}`, { bytes }, retries, target !== viaProxy);
    } catch (e) {
      if (!(e instanceof Unreachable) || target === viaProxy) throw e;
      target = viaProxy;
      res = await send("PUT", `${target}/chunks/${i}`, { bytes });
    }
    await ok(res);
    done.add(i);
    sentBytes += sizeOf(i);
    o.onProgress?.(sentBytes / o.file.size);
  }

  try {
    // 빠진 조각을 concurrency개씩 동시에 보낸다. 하나가 실패하면 나머지 일꾼도 다음 조각을 집지 않는다
    const todo: number[] = [];
    for (let i = 0; i < chunkCount; i++) if (!done.has(i)) todo.push(i);
    let failed: unknown = null;
    const worker = async () => {
      while (!failed) {
        const i = todo.shift();
        if (i === undefined) return;
        try {
          await putChunk(i);
        } catch (e) {
          failed ??= e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
    if (failed) throw failed;

    let res: Response;
    try {
      res = await send("POST", `${target}/complete`);
    } catch (e) {
      if (!(e instanceof Unreachable) || target === viaProxy) throw e;
      res = await send("POST", `${viaProxy}/complete`);
    }
    const video = await ok<VideoAsset>(res);
    store.remove(resumeKey);
    return video;
  } catch (e) {
    if (e instanceof Unreachable) {
      // 연결이 끊겼다: 받은 조각은 서버에 남겨 두고, 다음에 이어 올린다
      throw new ChunkUploadError("UNKNOWN", INTERRUPTED_MESSAGE);
    }
    // 서버가 거절했다: 올리던 것을 지운다 (못 지워도 하루 뒤 서버가 지운다)
    store.remove(resumeKey);
    void fetchFn(viaProxy, { method: "DELETE", headers: o.headers() }).catch(() => undefined);
    throw e;
  }
}
