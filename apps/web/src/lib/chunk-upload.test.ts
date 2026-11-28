import { describe, expect, it } from "vitest";
import { ChunkUploadError, uploadInChunks } from "./chunk-upload";

const META = { durationSec: 95, width: 1280, height: 720 };
const VIDEO = { id: "v-1", fileName: "a.mp4", mimeType: "video/mp4", sizeBytes: 10, durationSec: 95, width: 1280, height: 720, url: "/api/media/videos/v-1.mp4", uploadedBy: "u-member", uploadedAt: "2026-11-28T00:00:00.000Z" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** 조각 크기 4바이트로 받는 가짜 서버. fail(호출 번호)이 주는 응답이 있으면 그것을 대신 준다 */
function fakeServer(fail: (call: number, method: string, url: string) => Response | Error | null = () => null) {
  const calls: { method: string; url: string; auth: string | null; type: string | null; size: number }[] = [];
  const received: number[] = [];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const headers = init.headers as Record<string, string>;
    const size = init.body instanceof Blob ? init.body.size : 0;
    calls.push({ method, url, auth: headers.Authorization ?? null, type: headers["Content-Type"] ?? null, size });
    const failure = fail(calls.length, method, url);
    if (failure instanceof Error) throw failure;
    if (failure) return failure;
    if (method === "POST" && url.endsWith("/uploads")) return json({ id: "up-1", chunkBytes: 4, chunkCount: 3 }, 201);
    if (method === "PUT") {
      received.push(size);
      return json({ receivedBytes: received.reduce((a, b) => a + b, 0) });
    }
    if (method === "POST" && url.endsWith("/complete")) return json(VIDEO, 201);
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  return { fetchFn, calls, received };
}

const file = () => new File([new Uint8Array(10)], "a.mp4", { type: "video/mp4" });
const base = { baseUrl: "/api/me", headers: () => ({ Authorization: "Bearer t" }), meta: META, retryDelayMs: 0 };

describe("uploadInChunks", () => {
  it("서버가 알려 준 크기로 잘라 차례로 보내고, 끝나면 영상 정보를 돌려준다", async () => {
    const s = fakeServer();
    const progress: number[] = [];
    const video = await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn, onProgress: (f) => progress.push(f) });
    expect(video.id).toBe("v-1");
    expect(s.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/me/uploads",
      "PUT /api/me/uploads/up-1/chunks/0",
      "PUT /api/me/uploads/up-1/chunks/1",
      "PUT /api/me/uploads/up-1/chunks/2",
      "POST /api/me/uploads/up-1/complete",
    ]);
    expect(s.received).toEqual([4, 4, 2]);
    expect(s.calls.every((c) => c.auth === "Bearer t")).toBe(true);
    expect(s.calls[1]!.type).toBe("application/octet-stream");
    expect(progress).toEqual([0, 0.4, 0.8, 1]);
  });

  it("연결이 끊기거나 서버가 잠깐 못 받으면 그 조각을 다시 보낸다", async () => {
    // 3번째 호출(1번 조각)은 연결 실패, 4번째는 502, 5번째에 성공
    const s = fakeServer((n) => (n === 3 ? new TypeError("network") : n === 4 ? new Response("bad gateway", { status: 502 }) : null));
    const video = await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn });
    expect(video.id).toBe("v-1");
    expect(s.calls.filter((c) => c.url.endsWith("/chunks/1"))).toHaveLength(3);
    expect(s.received).toEqual([4, 4, 2]);
  });

  it("서버가 거절하면 그 까닭을 알리고, 올리던 것을 지운다", async () => {
    const s = fakeServer((_n, method, url) => (method === "PUT" && url.endsWith("/chunks/1") ? json({ code: "CONFLICT", message: "앞의 조각이 아직 오지 않았습니다." }, 409) : null));
    const err = await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn }).catch((e) => e);
    expect(err).toBeInstanceOf(ChunkUploadError);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toMatch(/앞의 조각/);
    expect(s.calls.at(-1)).toMatchObject({ method: "DELETE", url: "/api/me/uploads/up-1" });
  });

  it("계속 연결되지 않으면 그만둔다", async () => {
    const s = fakeServer((_n, method) => (method === "PUT" ? new TypeError("network") : null));
    const err = await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn, retries: 2 }).catch((e) => e);
    expect(err).toBeInstanceOf(ChunkUploadError);
    expect(err.message).toMatch(/연결이 끊겼습니다/);
    expect(s.calls.filter((c) => c.method === "PUT")).toHaveLength(3);
  });

  it("시작할 때 서버가 거절하면(영상이 아님 등) 조각을 보내지 않는다", async () => {
    const s = fakeServer((n) => (n === 1 ? json({ code: "VALIDATION", message: "영상 파일만 올릴 수 있습니다." }, 400) : null));
    const err = await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn }).catch((e) => e);
    expect(err.code).toBe("VALIDATION");
    expect(s.calls).toHaveLength(1);
  });
});
