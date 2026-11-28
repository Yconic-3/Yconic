import { describe, expect, it } from "vitest";
import { ChunkUploadError, INTERRUPTED_MESSAGE, uploadInChunks, type ResumeStore } from "./chunk-upload";

const META = { durationSec: 95, width: 1280, height: 720 };
const VIDEO = { id: "v-1", fileName: "a.mp4", mimeType: "video/mp4", sizeBytes: 10, durationSec: 95, width: 1280, height: 720, url: "/api/media/videos/v-1.mp4", uploadedBy: "u-member", uploadedAt: "2026-11-28T00:00:00.000Z" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Call {
  method: string;
  url: string;
  auth: string | null;
  type: string | null;
  size: number;
}

/**
 * 가짜 서버. 조각 크기 4바이트, 받은 조각을 기억한다.
 * respond가 응답(또는 오류)을 주면 그것을 대신 준다. uploadUrl: 조각을 직접 보낼 주소.
 */
function fakeServer(opts: { respond?: (call: Call, n: number) => Response | Error | null | undefined; uploadUrl?: string | null; received?: number[]; size?: number } = {}) {
  const calls: Call[] = [];
  const received = new Set<number>(opts.received ?? []);
  let inFlight = 0;
  let maxInFlight = 0;
  const size = opts.size ?? 10;
  const session = { id: "up-1", chunkBytes: 4, chunkCount: Math.ceil(size / 4), uploadUrl: opts.uploadUrl ?? null };
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const headers = init.headers as Record<string, string>;
    const call: Call = { method, url, auth: headers.Authorization ?? null, type: headers["Content-Type"] ?? null, size: init.body instanceof Blob ? init.body.size : 0 };
    calls.push(call);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((r) => setTimeout(r, 2));
      const custom = opts.respond?.(call, calls.length);
      if (custom instanceof Error) throw custom;
      if (custom) return custom;
      if (method === "POST" && url.endsWith("/uploads")) return json(session, 201);
      if (method === "GET") return json({ ...session, sizeBytes: size, received: [...received].sort((a, b) => a - b) });
      if (method === "PUT") {
        received.add(Number(url.split("/").pop()));
        return json({ receivedBytes: 0 });
      }
      if (method === "POST" && url.endsWith("/complete")) return json(VIDEO, 201);
      return new Response(null, { status: 204 });
    } finally {
      inFlight--;
    }
  }) as unknown as typeof fetch;
  return { fetchFn, calls, received, maxInFlight: () => maxInFlight };
}

function memoryStore(initial: Record<string, string> = {}): ResumeStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}

const file = (size = 10) => new File([new Uint8Array(size)], "a.mp4", { type: "video/mp4", lastModified: 1 });
const KEY = "/api/me|a.mp4|10|1";
const base = { baseUrl: "/api/me", headers: () => ({ Authorization: "Bearer t" }), meta: META, retryDelayMs: 0 };
const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT").map((c) => c.url);

describe("uploadInChunks", () => {
  it("서버가 알려 준 크기로 잘라 모두 보내고, 끝나면 영상 정보를 돌려준다", async () => {
    const s = fakeServer();
    const store = memoryStore();
    const progress: number[] = [];
    const video = await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn, resumeStore: store, concurrency: 1, onProgress: (f) => progress.push(f) });
    expect(video.id).toBe("v-1");
    expect(s.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/me/uploads",
      "PUT /api/me/uploads/up-1/chunks/0",
      "PUT /api/me/uploads/up-1/chunks/1",
      "PUT /api/me/uploads/up-1/chunks/2",
      "POST /api/me/uploads/up-1/complete",
    ]);
    expect(s.calls.filter((c) => c.method === "PUT").map((c) => c.size)).toEqual([4, 4, 2]);
    expect(s.calls.every((c) => c.auth === "Bearer t")).toBe(true);
    expect(s.calls[1]!.type).toBe("application/octet-stream");
    expect(progress).toEqual([0, 0.4, 0.8, 1]);
    // 끝나면 이어 올리기 기억을 지운다
    expect(store.data.size).toBe(0);
  });

  it("여러 조각을 동시에 보낸다 (정한 수를 넘지 않게)", async () => {
    const s = fakeServer({ size: 40 });
    await uploadInChunks({ ...base, file: file(40), fetchFn: s.fetchFn, resumeStore: memoryStore(), concurrency: 4 });
    expect([...s.received].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(s.maxInFlight()).toBe(4);
    // 끝내기는 모든 조각을 보낸 뒤에 한 번만
    expect(s.calls.at(-1)!.url).toBe("/api/me/uploads/up-1/complete");
    expect(s.calls.filter((c) => c.url.endsWith("/complete"))).toHaveLength(1);
  });

  it("서버가 직접 받을 주소를 알려 주면 조각과 끝내기를 그쪽으로 보낸다", async () => {
    const s = fakeServer({ uploadUrl: "https://server.example/api/me/uploads/up-1" });
    await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn, resumeStore: memoryStore() });
    expect(s.calls[0]!.url).toBe("/api/me/uploads");
    expect(puts(s.calls).every((u) => u.startsWith("https://server.example/api/me/uploads/up-1/chunks/"))).toBe(true);
    expect(s.calls.at(-1)!.url).toBe("https://server.example/api/me/uploads/up-1/complete");
  });

  it("직접 보내는 주소에 닿지 않으면 시작한 주소로 돌아가 모두 올린다", async () => {
    const s = fakeServer({
      uploadUrl: "https://server.example/api/me/uploads/up-1",
      respond: (c) => (c.url.startsWith("https://server.example") ? new TypeError("Failed to fetch") : null),
    });
    const video = await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn, resumeStore: memoryStore(), concurrency: 1 });
    expect(video.id).toBe("v-1");
    expect([...s.received].sort()).toEqual([0, 1, 2]);
    // 직접 주소는 처음 한 번만 두드려 보고, 그 뒤로는 프록시 주소만 쓴다
    expect(s.calls.filter((c) => c.url.startsWith("https://server.example"))).toHaveLength(1);
    expect(s.calls.at(-1)!.url).toBe("/api/me/uploads/up-1/complete");
  });

  it("직접 보내는 주소가 잠깐 못 받는 것(5xx)은 그 주소로 다시 보낸다 (프록시로 돌아가지 않는다)", async () => {
    let failed = false;
    const s = fakeServer({
      uploadUrl: "https://server.example/api/me/uploads/up-1",
      respond: (c) => {
        if (c.method !== "PUT" || !c.url.endsWith("/chunks/1") || failed) return null;
        failed = true;
        return new Response("bad gateway", { status: 502 });
      },
    });
    await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn, resumeStore: memoryStore(), concurrency: 1 });
    expect(s.calls.filter((c) => c.url.endsWith("/chunks/1")).map((c) => c.url)).toEqual(Array(2).fill("https://server.example/api/me/uploads/up-1/chunks/1"));
    expect(s.calls.filter((c) => c.method !== "POST" || !c.url.endsWith("/uploads")).every((c) => c.url.startsWith("https://server.example"))).toBe(true);
  });

  it("서버가 계속 못 받으면(5xx) 올리던 것을 지우지 않고 다음에 이어 올리게 한다", async () => {
    const store = memoryStore();
    const s = fakeServer({ respond: (c) => (c.method === "PUT" ? new Response("unavailable", { status: 503 }) : null) });
    const err = await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn, resumeStore: store, concurrency: 1, retries: 1 }).catch((e) => e);
    expect(err.message).toBe(INTERRUPTED_MESSAGE);
    expect(s.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(store.data.get(KEY)).toBe("up-1");
  });

  it("연결이 끊기거나 서버가 잠깐 못 받으면 그 조각을 다시 보낸다", async () => {
    let failures = 0;
    const s = fakeServer({
      respond: (c) => {
        if (c.method !== "PUT" || !c.url.endsWith("/chunks/1") || failures >= 2) return null;
        return failures++ === 0 ? new TypeError("network") : new Response("bad gateway", { status: 502 });
      },
    });
    const video = await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn, resumeStore: memoryStore(), concurrency: 1 });
    expect(video.id).toBe("v-1");
    expect(s.calls.filter((c) => c.url.endsWith("/chunks/1"))).toHaveLength(3);
  });

  it("끝내 연결되지 않으면 그만두되, 받은 조각은 남겨 두고 다음에 이어 올린다", async () => {
    const store = memoryStore();
    const broken = fakeServer({ respond: (c) => (c.method === "PUT" && c.url.endsWith("/chunks/2") ? new TypeError("network") : null) });
    const err = await uploadInChunks({ ...base, file: file(), fetchFn: broken.fetchFn, resumeStore: store, concurrency: 1, retries: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ChunkUploadError);
    expect(err.message).toBe(INTERRUPTED_MESSAGE);
    // 서버의 올리던 것을 지우지 않았고, 어느 올리기인지 기억해 두었다
    expect(broken.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(store.data.get(KEY)).toBe("up-1");

    // 같은 파일을 다시 올리면: 어디까지 받았는지 묻고, 빠진 조각만 보낸다
    const again = fakeServer({ received: [0, 1] });
    const progress: number[] = [];
    const video = await uploadInChunks({ ...base, file: file(), fetchFn: again.fetchFn, resumeStore: store, onProgress: (f) => progress.push(f) });
    expect(video.id).toBe("v-1");
    expect(again.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET /api/me/uploads/up-1", "PUT /api/me/uploads/up-1/chunks/2", "POST /api/me/uploads/up-1/complete"]);
    expect(progress).toEqual([0.8, 1]);
    expect(store.data.size).toBe(0);
  });

  it("기억해 둔 올리기가 서버에 없으면(하루가 지남) 처음부터 올린다", async () => {
    const store = memoryStore({ [KEY]: "up-old" });
    const s = fakeServer({ respond: (c) => (c.method === "GET" ? json({ code: "NOT_FOUND", message: "없음" }, 404) : null) });
    await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn, resumeStore: store, concurrency: 1 });
    expect(s.calls.slice(0, 2).map((c) => `${c.method} ${c.url}`)).toEqual(["GET /api/me/uploads/up-old", "POST /api/me/uploads"]);
    expect(puts(s.calls)).toHaveLength(3);
  });

  it("다른 파일(이름이나 크기가 다름)은 이어 올리지 않는다", async () => {
    const store = memoryStore({ [KEY]: "up-1" });
    const s = fakeServer({ size: 12 });
    await uploadInChunks({ ...base, file: file(12), fetchFn: s.fetchFn, resumeStore: store, concurrency: 1 });
    expect(s.calls[0]!.method).toBe("POST");
    // 먼저 올리던 파일의 기억은 그대로다
    expect(store.data.get(KEY)).toBe("up-1");
  });

  it("서버가 거절하면 그 까닭을 알리고, 올리던 것을 지운다", async () => {
    const store = memoryStore();
    const s = fakeServer({ respond: (c) => (c.method === "PUT" && c.url.endsWith("/chunks/1") ? json({ code: "VALIDATION", message: "조각 크기가 맞지 않습니다." }, 400) : null) });
    const err = await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn, resumeStore: store, concurrency: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ChunkUploadError);
    expect(err.code).toBe("VALIDATION");
    expect(err.message).toMatch(/조각 크기/);
    expect(s.calls.at(-1)).toMatchObject({ method: "DELETE", url: "/api/me/uploads/up-1" });
    expect(store.data.size).toBe(0);
    // 실패한 뒤에는 남은 조각을 보내지 않는다
    expect(puts(s.calls)).toEqual(["/api/me/uploads/up-1/chunks/0", "/api/me/uploads/up-1/chunks/1"]);
  });

  it("시작할 때 서버가 거절하면(영상이 아님 등) 조각을 보내지 않는다", async () => {
    const s = fakeServer({ respond: (c) => (c.method === "POST" ? json({ code: "VALIDATION", message: "영상 파일만 올릴 수 있습니다." }, 400) : null) });
    const err = await uploadInChunks({ ...base, file: file(), fetchFn: s.fetchFn, resumeStore: memoryStore() }).catch((e) => e);
    expect(err.code).toBe("VALIDATION");
    expect(s.calls).toHaveLength(1);
  });
});
