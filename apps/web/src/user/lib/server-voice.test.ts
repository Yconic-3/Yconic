import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerVoice } from "./server-voice";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** 주소별로 응답을 정해 두는 가짜 fetch. POST /tts 는 받은 글로 주소를 만든다 */
function fakeApi(opts: { enabled?: boolean; maxChars?: number; tts?: (text: string) => Response | Promise<Response> } = {}) {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/tts/config")) {
      calls.push("config");
      return json(200, { enabled: opts.enabled ?? true, maxChars: opts.maxChars ?? 300 });
    }
    const text = (JSON.parse(String(init!.body)) as { text: string }).text;
    calls.push(text);
    return opts.tts ? opts.tts(text) : json(200, { url: `/api/media/tts/${encodeURIComponent(text)}.mp3` });
  }) as typeof fetch;
  return { fn, calls };
}

describe("createServerVoice", () => {
  it("서버가 켜져 있다고 하면 쓸 수 있고, 한 번만 묻는다", async () => {
    const on = fakeApi();
    const voice = createServerVoice("/api", on.fn);
    expect(await voice.available()).toBe(true);
    expect(await voice.available()).toBe(true);
    expect(on.calls).toEqual(["config"]);
    expect(await createServerVoice("/api", fakeApi({ enabled: false }).fn).available()).toBe(false);
  });

  it("서버에 묻지 못하면 쓸 수 없는 것으로 보고, 다음에 다시 묻는다", async () => {
    let down = true;
    const fn = (async () => {
      if (down) throw new TypeError("fetch failed");
      return json(200, { enabled: true, maxChars: 300 });
    }) as typeof fetch;
    const voice = createServerVoice("/api", fn);
    expect(await voice.available()).toBe(false);
    down = false;
    expect(await voice.available()).toBe(true);
  });

  it("글의 음성 파일 주소를 받는다. 같은 글은 다시 묻지 않는다 (띄어쓰기만 달라도, 동시에 물어도)", async () => {
    const api = fakeApi();
    const voice = createServerVoice("/api", api.fn);
    const [a, b] = await Promise.all([voice.urlFor("천천히 앉으세요."), voice.urlFor("천천히  앉으세요. ")]);
    expect(a).toBe(`/api/media/tts/${encodeURIComponent("천천히 앉으세요.")}.mp3`);
    expect(b).toBe(a);
    expect(await voice.urlFor("천천히 앉으세요.")).toBe(a);
    expect(api.calls).toEqual(["천천히 앉으세요."]);
  });

  it("빈 글과 너무 긴 글은 서버에 묻지 않는다 (기기의 목소리로 읽게 한다)", async () => {
    const api = fakeApi({ maxChars: 10 });
    const voice = createServerVoice("/api", api.fn);
    await voice.available();
    expect(await voice.urlFor("  ")).toBeNull();
    expect(await voice.urlFor("가".repeat(11))).toBeNull();
    expect(await voice.urlFor("가".repeat(10))).not.toBeNull();
    expect(api.calls).toEqual(["config", "가".repeat(10)]);
  });

  it("실패한 글은 기억하지 않고 다음에 다시 묻는다", async () => {
    let fail = true;
    const api = fakeApi({ tts: (text) => (fail ? json(500, { code: "UNKNOWN" }) : json(200, { url: `/u/${text}` })) });
    const voice = createServerVoice("/api", api.fn);
    expect(await voice.urlFor("하나.")).toBeNull();
    fail = false;
    expect(await voice.urlFor("하나.")).toBe("/u/하나.");
  });

  it("잇달아 세 번 실패하면 한동안 묻지 않는다 (말할 때마다 기다리게 하지 않으려고)", async () => {
    let t = 0;
    const api = fakeApi({ tts: () => json(403, { code: "FORBIDDEN" }) });
    const voice = createServerVoice("/api", api.fn, () => t);
    for (const text of ["하나.", "둘.", "셋."]) expect(await voice.urlFor(text)).toBeNull();
    expect(await voice.urlFor("넷.")).toBeNull();
    expect(api.calls).toEqual(["하나.", "둘.", "셋."]);
    t = 61_000;
    await voice.urlFor("다섯.");
    expect(api.calls).toHaveLength(4);
  });
});

/** 재생기와 기기의 목소리를 가짜로 바꿔 끼우고 speech.ts를 새로 불러온다 */
async function loadSpeech() {
  vi.resetModules();
  const played: FakeAudio[] = [];
  class FakeAudio {
    src = "";
    playbackRate = 1;
    defaultPlaybackRate = 1;
    paused = true;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    /** 이 주소는 재생에 실패한다 */
    static broken = "";
    constructor(src?: string) {
      if (src) this.src = src;
      played.push(this);
    }
    plays: string[] = [];
    play() {
      this.paused = false;
      this.plays.push(this.src);
      if (FakeAudio.broken && this.src === FakeAudio.broken) return Promise.reject(new Error("재생 실패"));
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    /** 지금 재생 중인 파일이 끝났다 */
    end() {
      this.onended?.();
    }
  }
  const deviceSpoken: string[] = [];
  class FakeUtterance {
    lang = "";
    rate = 1;
    voice: unknown = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }
  const speechSynthesis = {
    getVoices: () => [],
    speak: (u: FakeUtterance) => {
      deviceSpoken.push(u.text);
      queueMicrotask(() => u.onend?.());
    },
    cancel: () => undefined,
    resume: () => undefined,
    pause: () => undefined,
  };
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("window", { speechSynthesis });
  const speech = await import("./speech");
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { speech, played, deviceSpoken, FakeAudio, tick };
}

describe("speak: 서버 목소리로 읽기", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const urlOf = (text: string) => `/tts/${text}`;

  it("문장마다 음성 파일을 받아 차례로 재생하고, 읽는 동안 다음 문장을 미리 받는다", async () => {
    const { speech, played, deviceSpoken, tick } = await loadSpeech();
    const asked: string[] = [];
    speech.setServerVoice(async (text) => {
      asked.push(text);
      return urlOf(text);
    });
    const done = speech.speak("무릎이 아프면 멈추세요. 천천히 숨을 쉬세요.", { rate: 1.2 });
    await tick();
    const audio = played[0]!;
    expect(audio.plays).toEqual([urlOf("무릎이 아프면 멈추세요.")]);
    expect(audio.playbackRate).toBe(1.2);
    // 첫 문장을 읽는 동안 둘째 문장을 이미 물었다
    expect(asked).toEqual(["무릎이 아프면 멈추세요.", "천천히 숨을 쉬세요."]);
    expect(speech.getSpeechState().speaking).toBe(true);
    audio.end();
    await tick();
    expect(audio.plays).toEqual([urlOf("무릎이 아프면 멈추세요."), urlOf("천천히 숨을 쉬세요.")]);
    audio.end();
    expect(await done).toBe(true);
    expect(speech.getSpeechState().speaking).toBe(false);
    expect(deviceSpoken).toEqual([]);
    // 재생기는 하나만 쓴다
    expect(played).toHaveLength(1);
  });

  it("서버가 주지 못한 문장부터는 기기의 목소리로 읽는다", async () => {
    const { speech, played, deviceSpoken, tick } = await loadSpeech();
    speech.setServerVoice(async (text) => (text.startsWith("천천히") ? null : urlOf(text)));
    const done = speech.speak("무릎이 아프면 멈추세요. 천천히 숨을 쉬세요. 다 끝났어요.");
    await tick();
    played[0]!.end();
    expect(await done).toBe(true);
    expect(played[0]!.plays).toEqual([urlOf("무릎이 아프면 멈추세요.")]);
    expect(deviceSpoken).toEqual(["천천히 숨을 쉬세요.", "다 끝났어요."]);
  });

  it("음성 파일이 재생되지 않으면 그 문장을 기기의 목소리로 읽는다", async () => {
    const { speech, deviceSpoken, FakeAudio } = await loadSpeech();
    FakeAudio.broken = urlOf("안녕하세요.");
    speech.setServerVoice(async (text) => urlOf(text));
    expect(await speech.speak("안녕하세요.")).toBe(true);
    expect(deviceSpoken).toEqual(["안녕하세요."]);
  });

  it("읽는 중에 멈추면 거기서 끝나고(false), 뒤의 문장은 읽지 않는다", async () => {
    const { speech, played, deviceSpoken, tick } = await loadSpeech();
    speech.setServerVoice(async (text) => urlOf(text));
    const done = speech.speak("첫 문장입니다. 둘째 문장입니다.");
    await tick();
    speech.stopSpeaking();
    expect(await done).toBe(false);
    expect(played[0]!.paused).toBe(true);
    expect(played[0]!.plays).toHaveLength(1);
    expect(deviceSpoken).toEqual([]);
    expect(speech.getSpeechState().speaking).toBe(false);
  });

  it("서버가 2.5초 안에 주지 못하면 기다리지 않고 기기의 목소리로 읽는다", async () => {
    const { speech, played, deviceSpoken } = await loadSpeech();
    vi.useFakeTimers();
    try {
      speech.setServerVoice(() => new Promise(() => undefined));
      const done = speech.speak("서버가 답하지 않는 문장입니다.");
      await vi.advanceTimersByTimeAsync(speech.SERVER_VOICE_WAIT_MS - 100);
      expect(deviceSpoken).toEqual([]);
      await vi.advanceTimersByTimeAsync(200);
      expect(deviceSpoken).toEqual(["서버가 답하지 않는 문장입니다."]);
      expect(await done).toBe(true);
      expect(played[0]?.plays ?? []).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("서버 목소리가 없으면 예전처럼 기기의 목소리로 읽는다", async () => {
    const { speech, played, deviceSpoken } = await loadSpeech();
    expect(await speech.speak("첫 문장을 읽습니다. 둘째 문장을 읽습니다.")).toBe(true);
    expect(deviceSpoken).toEqual(["첫 문장을 읽습니다.", "둘째 문장을 읽습니다."]);
    expect(played).toHaveLength(0);
  });

  it("미리 만든 음성 파일(audioUrl)이 있으면 그것을 재생하고, 멈추면 끝난다", async () => {
    const { speech, played, tick } = await loadSpeech();
    speech.setServerVoice(async (text) => urlOf(text));
    const done = speech.speak("안내 글", { audioUrl: "/media/tts/guide.mp3" });
    await tick();
    expect(played.at(-1)!.plays).toEqual(["/media/tts/guide.mp3"]);
    speech.stopSpeaking();
    expect(await done).toBe(false);
  });
});
