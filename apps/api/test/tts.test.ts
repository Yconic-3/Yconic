import type { TtsConfig, TtsResponse } from "@yconic/shared-types";
import { afterEach, describe, expect, it } from "vitest";
import { createGoogleSynthesizer, type SpeechSynthesizer } from "../src/tts/synthesizer";
import type { ApiConfig } from "../src/config";
import { client, login, startTestServer, type TestServer } from "./helpers";

let s: TestServer | null = null;
afterEach(async () => {
  await s?.close();
  s = null;
});

/** 받은 글을 그대로 바이트로 돌려주는 가짜 음성 만들기. 몇 번 불렸는지 센다 */
function fakeSynth(fail?: (text: string) => boolean) {
  const calls: string[] = [];
  const synth: SpeechSynthesizer = async (text) => {
    calls.push(text);
    await new Promise((r) => setTimeout(r, 10));
    if (fail?.(text)) throw new Error("가짜 음성 만들기 실패");
    return Buffer.from(`mp3:${text}`);
  };
  return { synth, calls };
}

async function start(tts: SpeechSynthesizer | null, config: Partial<ApiConfig> = {}) {
  s = await startTestServer({ tts, config });
  return s;
}
const speak = (base: string, text: unknown, ip = "203.0.113.1") =>
  fetch(`${base}/tts`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ text }) });

describe("서버 목소리 (POST /tts)", () => {
  it("꺼져 있으면(키 없음) 그렇다고 알리고, 음성을 만들지 않는다", async () => {
    const t = await start(null);
    expect((await client(t.baseUrl).get<TtsConfig>("/tts/config")).body).toEqual({ enabled: false, maxChars: 300 });
    expect((await speak(t.baseUrl, "안녕하세요.")).status).toBe(404);
  });

  it("글을 음성 파일로 만들어 주소를 돌려주고, 그 주소로 재생할 수 있다", async () => {
    const f = fakeSynth();
    const t = await start(f.synth);
    expect((await client(t.baseUrl).get<TtsConfig>("/tts/config")).body.enabled).toBe(true);
    const res = await speak(t.baseUrl, "무릎이 아프면 멈추세요.");
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as TtsResponse;
    expect(url).toMatch(/\/media\/tts\/[0-9a-f]{32}\.mp3$/);
    const audio = await fetch(url);
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toMatch(/audio\/mpeg/);
    expect(await audio.text()).toBe("mp3:무릎이 아프면 멈추세요.");
  });

  it("같은 글은 한 번만 만든다 (띄어쓰기만 다른 글, 동시에 온 요청도)", async () => {
    const f = fakeSynth();
    const t = await start(f.synth);
    const [a, b] = await Promise.all([speak(t.baseUrl, "천천히 앉으세요."), speak(t.baseUrl, "천천히 앉으세요.")]);
    const first = ((await a.json()) as TtsResponse).url;
    expect(((await b.json()) as TtsResponse).url).toBe(first);
    expect(((await (await speak(t.baseUrl, "  천천히   앉으세요. ")).json()) as TtsResponse).url).toBe(first);
    expect(f.calls).toEqual(["천천히 앉으세요."]);
    // 다른 글은 다른 파일이다
    expect(((await (await speak(t.baseUrl, "천천히 일어나세요.")).json()) as TtsResponse).url).not.toBe(first);
  });

  it("빈 글, 글이 아닌 것, 너무 긴 글은 받지 않는다", async () => {
    const f = fakeSynth();
    const t = await start(f.synth, { ttsMaxChars: 20 });
    expect((await speak(t.baseUrl, "")).status).toBe(400);
    expect((await speak(t.baseUrl, "   ")).status).toBe(400);
    expect((await speak(t.baseUrl, 123)).status).toBe(400);
    expect((await speak(t.baseUrl, "가".repeat(21))).status).toBe(400);
    expect((await speak(t.baseUrl, "가".repeat(20))).status).toBe(200);
    expect(f.calls).toHaveLength(1);
  });

  it("한 곳에서 너무 자주 부르면 막는다", async () => {
    const t = await start(fakeSynth().synth, { ttsPerIpPerMinute: 2 });
    expect((await speak(t.baseUrl, "하나.", "203.0.113.9")).status).toBe(200);
    expect((await speak(t.baseUrl, "둘.", "203.0.113.9")).status).toBe(200);
    expect((await speak(t.baseUrl, "셋.", "203.0.113.9")).status).toBe(403);
    expect((await speak(t.baseUrl, "셋.", "203.0.113.10")).status).toBe(200);
  });

  it("하루에 새로 만드는 글자 수를 넘으면 막는다. 이미 만든 글은 계속 읽을 수 있다", async () => {
    const f = fakeSynth();
    const t = await start(f.synth, { ttsDailyChars: 10 });
    expect((await speak(t.baseUrl, "여섯 글자요.")).status).toBe(200);
    const over = await speak(t.baseUrl, "이건 한도를 넘어요.");
    expect(over.status).toBe(403);
    expect(((await over.json()) as { message: string }).message).toMatch(/다 썼습니다/);
    expect((await speak(t.baseUrl, "여섯 글자요.")).status).toBe(200);
    expect(f.calls).toEqual(["여섯 글자요."]);
  });

  it("만들지 못하면 500으로 알리고, 다음에 다시 시도한다 (쓰다 만 파일을 남기지 않는다)", async () => {
    let broken = true;
    const f = fakeSynth(() => broken);
    const t = await start(f.synth);
    expect((await speak(t.baseUrl, "다시 해 볼게요.")).status).toBe(500);
    broken = false;
    const res = await speak(t.baseUrl, "다시 해 볼게요.");
    expect(res.status).toBe(200);
    expect(await (await fetch(((await res.json()) as TtsResponse).url)).text()).toBe("mp3:다시 해 볼게요.");
    expect(f.calls).toHaveLength(2);
  });
});

describe("공개하는 폴더", () => {
  it("올리는 중인 영상 조각은 주소로 열리지 않는다 (영상과 음성 파일만 공개한다)", async () => {
    const t = await start(null);
    const me = await login(t.baseUrl, "member@example.com", "member1234");
    const up = await me.post("/me/uploads", { fileName: "a.mp4", mimeType: "video/mp4", sizeBytes: 10, durationSec: 5, width: 0, height: 0 });
    expect(up.status).toBe(201);
    expect((await fetch(`${t.baseUrl}/media/uploads/${up.body.id}/meta.json`)).status).toBe(404);
    expect((await fetch(`${t.baseUrl}/media/uploads/${up.body.id}/data`)).status).toBe(404);
  });
});

describe("createGoogleSynthesizer", () => {
  it("키는 머리말로 보내고, 음성 이름에서 언어를 뽑아 MP3로 받는다", async () => {
    const seen: { url: string; headers: Record<string, string>; body: unknown }[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), headers: init!.headers as Record<string, string>, body: JSON.parse(String(init!.body)) });
      return new Response(JSON.stringify({ audioContent: Buffer.from("소리").toString("base64") }), { status: 200 });
    }) as typeof fetch;
    const synth = createGoogleSynthesizer({ apiKey: "test-key", voice: "ko-KR-Chirp3-HD-Kore", fetchFn });
    expect((await synth("안녕하세요.")).toString()).toBe("소리");
    expect(seen[0]!.url).toBe("https://texttospeech.googleapis.com/v1/text:synthesize");
    expect(seen[0]!.url).not.toContain("test-key");
    expect(seen[0]!.headers["x-goog-api-key"]).toBe("test-key");
    expect(seen[0]!.body).toEqual({ input: { text: "안녕하세요." }, voice: { languageCode: "ko-KR", name: "ko-KR-Chirp3-HD-Kore" }, audioConfig: { audioEncoding: "MP3" } });
  });

  it("구글이 거절하거나 음성이 비어 있으면 실패로 알린다", async () => {
    const denied = createGoogleSynthesizer({ apiKey: "k", voice: "ko-KR-Neural2-A", fetchFn: (async () => new Response('{"error":{"message":"API key not valid"}}', { status: 400 })) as typeof fetch });
    await expect(denied("안녕")).rejects.toThrow(/Google TTS 400/);
    const empty = createGoogleSynthesizer({ apiKey: "k", voice: "ko-KR-Neural2-A", fetchFn: (async () => new Response("{}", { status: 200 })) as typeof fetch });
    await expect(empty("안녕")).rejects.toThrow(/비어/);
  });
});
