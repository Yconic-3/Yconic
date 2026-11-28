import { createEchoFilter } from "./echo";
import type { VoiceFetcher } from "./server-voice";

/**
 * 안내를 소리 내어 읽는다. 목소리는 세 가지 중 하나다.
 * 1) 구간에 생성된 음성 파일(`tts.audioUrl`)이 있으면 그 파일을 재생한다.
 * 2) 서버 목소리가 켜져 있으면(setServerVoice) 문장마다 서버가 만든 음성 파일을 받아 재생한다 (docs/decisions/0021).
 * 3) 둘 다 아니거나 서버가 제때 주지 못하면 브라우저 내장 음성(기기의 목소리)으로 읽는다.
 *
 * 음성 안내를 끄면(setSpeechEnabled(false)) 소리 없이 글을 읽을 만한 시간만 기다렸다가 끝난 것으로 친다.
 * 그래서 운동 진행(주의사항 → 단계)은 소리가 없어도 같은 흐름으로 이어진다. 화면에는 '방금 안내'로 글이 남는다.
 */
export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickKoreanVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith("ko")) ?? null;
}

export interface SpeechState {
  /** 음성 안내를 켰는지 */
  enabled: boolean;
  /** 지금 읽고 있는지 (소리를 끈 상태에서 글을 보여 주며 기다리는 중이면 false) */
  speaking: boolean;
  /** 읽다가 잠시 멈췄는지 */
  paused: boolean;
}

let state: SpeechState = { enabled: true, speaking: false, paused: false };
const listeners = new Set<() => void>();

function update(patch: Partial<SpeechState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** React의 useSyncExternalStore로 상태를 구독한다 */
export function subscribeSpeech(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSpeechState(): SpeechState {
  return state;
}

const SERVER_STATE: SpeechState = { enabled: true, speaking: false, paused: false };
export function getServerSpeechState(): SpeechState {
  return SERVER_STATE;
}

let currentAudio: HTMLAudioElement | null = null;
/** 재생 중인 음성 파일을 기다리는 쪽에 "멈췄다"고 알린다 (멈춘 파일은 끝났다는 신호를 주지 않는다) */
let audioStopped: (() => void) | null = null;

/** 서버 목소리: 글 하나의 음성 파일 주소를 주는 함수. 없으면 기기의 목소리로 읽는다 */
let serverVoice: VoiceFetcher | null = null;
export function setServerVoice(fetcher: VoiceFetcher | null) {
  serverVoice = fetcher;
}
/** 서버가 음성 파일을 이만큼 안에 주지 못하면 그 말은 기기의 목소리로 읽는다 (조용히 기다리게 하지 않는다) */
export const SERVER_VOICE_WAIT_MS = 2500;

/**
 * 서버 목소리를 재생하는 하나뿐인 재생기. 휴대폰 브라우저는 사람이 화면을 누른 뒤에 시작한 재생기만 소리를 내게 하므로,
 * 재생기를 하나만 두고 처음 누를 때 한 번 깨워 둔다 (primeAudio). 그 뒤로는 누르지 않아도 재생할 수 있다.
 */
let player: HTMLAudioElement | null = null;
function getPlayer(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  player ??= new Audio();
  return player;
}
// 아주 짧은 무음 (WAV)
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
let primed = false;
/** 사람이 화면을 처음 눌렀을 때 부른다: 재생기를 깨워 둔다 */
export function primeAudio() {
  if (primed) return;
  const audio = getPlayer();
  if (!audio || state.speaking) return;
  primed = true;
  audio.src = SILENCE;
  void audio.play().then(() => audio.pause()).catch(() => undefined);
}
/** 지금 읽고 있는 말과 그 끝을 알리는 약속 (같은 말을 다시 시작하지 않으려고) */
let currentText = "";
let currentPromise: Promise<boolean> | null = null;

/** 앱이 소리 내어 읽은 말 (마이크로 다시 들어오면 메아리로 거른다) */
export const spokenEcho = createEchoFilter();
// 소리를 끈 상태에서 '읽는 시간'을 기다리는 타이머와 그 끝 처리
let quietTimer: ReturnType<typeof setTimeout> | null = null;
let quietDone: ((finished: boolean) => void) | null = null;
// 발화마다 번호를 붙여, 끊긴 발화가 뒤늦게 "끝났다"고 알리지 못하게 한다.
let utteranceSeq = 0;

export function stopSpeaking() {
  utteranceSeq++;
  currentText = "";
  currentPromise = null;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  const stopped = audioStopped;
  audioStopped = null;
  stopped?.();
  if (quietTimer) {
    clearTimeout(quietTimer);
    quietTimer = null;
  }
  const done = quietDone;
  quietDone = null;
  done?.(false);
  if (speechSupported()) {
    window.speechSynthesis.resume();
    window.speechSynthesis.cancel();
  }
  if (state.speaking || state.paused) update({ speaking: false, paused: false });
}

/** 음성 안내를 켜거나 끈다. 끄면 지금 읽던 말도 멈춘다 */
export function setSpeechEnabled(enabled: boolean) {
  if (enabled === state.enabled) return;
  stopSpeaking();
  update({ enabled });
}

/** 읽던 말을 잠시 멈춘다 (다시 누르면 이어서 읽는다) */
export function pauseSpeaking() {
  if (!state.speaking || state.paused) return;
  if (currentAudio) currentAudio.pause();
  else if (speechSupported()) window.speechSynthesis.pause();
  update({ paused: true });
}

export function resumeSpeaking() {
  if (!state.paused) return;
  if (currentAudio) void currentAudio.play().catch(() => undefined);
  else if (speechSupported()) window.speechSynthesis.resume();
  update({ paused: false });
}

/** 재생할 수 있는 음성 파일 주소인지 (모의 데이터의 mock:// 주소는 재생할 수 없다) */
export function isPlayableAudioUrl(url: string | null | undefined): url is string {
  return !!url && /^(https?:|blob:|\/)/.test(url);
}

/** 소리 없이 글을 읽을 만한 시간 (밀리초) */
export function readingTimeMs(text: string): number {
  return Math.max(2000, text.trim().length * 120);
}

/**
 * 이전 발화를 끊고 새로 읽는다.
 * 끝까지 읽으면 true, 중간에 끊기면 false로 끝난다.
 * 음성을 껐거나 이 브라우저가 음성 합성을 못 하면, 글을 읽을 시간만큼 기다린 뒤 true로 끝난다.
 */
export function speak(text: string, opts: { rate?: number; audioUrl?: string | null } = {}): Promise<boolean> {
  // 같은 말을 읽고 있는 중이면 처음부터 다시 읽지 않는다 (같은 말이 되풀이되는 것처럼 들리지 않게)
  if (state.speaking && !state.paused && currentText === text && currentPromise) return currentPromise;
  stopSpeaking();
  currentText = text;
  if (state.enabled && text.trim()) spokenEcho.spoke(text);
  const seq = utteranceSeq;
  const rate = opts.rate ?? 1;
  const finish = (resolve: (v: boolean) => void) => (ok: boolean) => {
    if (seq === utteranceSeq) update({ speaking: false, paused: false });
    resolve(ok && seq === utteranceSeq);
  };

  if (!text.trim() && !isPlayableAudioUrl(opts.audioUrl)) return Promise.resolve(true);

  if (!state.enabled || (!speechSupported() && !isPlayableAudioUrl(opts.audioUrl) && !(serverVoice && getPlayer()))) {
    return new Promise((resolve) => {
      quietDone = resolve;
      quietTimer = setTimeout(() => {
        quietTimer = null;
        quietDone = null;
        resolve(seq === utteranceSeq);
      }, readingTimeMs(text));
    });
  }

  update({ speaking: true, paused: false });

  if (isPlayableAudioUrl(opts.audioUrl)) {
    return new Promise((resolve) => {
      const done = finish(resolve);
      void playFile(new Audio(opts.audioUrl ?? undefined), rate, text).then((result) => done(result === "ended"));
    });
  }

  // 긴 글은 문장마다 나눠 읽는다. 브라우저 음성은 긴 글을 읽다가 멈추거나 끝을 알리지 않을 때가 있다.
  const sentences = splitSentences(text);
  const fetchVoice = serverVoice;
  const audio = fetchVoice ? getPlayer() : null;
  currentPromise = new Promise((resolve) => {
    const done = finish(resolve);
    if (!fetchVoice || !audio) return speakWithDevice(sentences, rate, seq, done);

    // 서버 목소리: 문장마다 음성 파일을 받아 차례로 재생한다. 한 문장을 읽는 동안 다음 문장을 미리 받는다.
    // 서버가 제때 주지 못하거나 재생이 안 되면, 그 문장부터는 기기의 목소리로 읽는다.
    const within = (sentence: string) => Promise.race([fetchVoice(sentence).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), SERVER_VOICE_WAIT_MS))]);
    void (async () => {
      let next = within(sentences[0]!);
      for (let i = 0; i < sentences.length; i++) {
        const url = await next;
        if (seq !== utteranceSeq) return done(false);
        if (!url) return speakWithDevice(sentences.slice(i), rate, seq, done);
        if (i + 1 < sentences.length) next = within(sentences[i + 1]!);
        audio.src = url;
        const result = await playFile(audio, rate, sentences[i]!);
        if (seq !== utteranceSeq || result === "stopped") return done(false);
        if (result === "error") return speakWithDevice(sentences.slice(i), rate, seq, done);
      }
      done(true);
    })();
  });
  return currentPromise;
}

/**
 * 음성 파일 하나를 재생한다. 끝까지 재생하면 "ended", 재생하지 못하면 "error", 도중에 멈추면(stopSpeaking) "stopped".
 * 끝났다는 신호가 오지 않으면 읽을 시간이 지난 뒤 끝난 것으로 본다.
 */
function playFile(audio: HTMLAudioElement, rate: number, text: string): Promise<"ended" | "error" | "stopped"> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: "ended" | "error" | "stopped") => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      audio.onended = null;
      audio.onerror = null;
      if (audioStopped === onStop) audioStopped = null;
      resolve(result);
    };
    const onStop = () => settle("stopped");
    const watchdog = setTimeout(() => settle("ended"), (readingTimeMs(text || "가나다라마바사아자차") / Math.max(rate, 0.5)) * 2 + 5000);
    // 새 파일을 올리면 재생 속도가 기본값으로 돌아가므로 기본값도 함께 맞춘다
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    currentAudio = audio;
    audioStopped = onStop;
    audio.onended = () => settle("ended");
    audio.onerror = () => settle("error");
    audio.play().catch(() => settle("error"));
  });
}

/**
 * 기기의 목소리(브라우저 내장 음성)로 문장들을 차례로 읽는다.
 * 오류가 나면 다시 읽지 않고 끝낸다. 끝을 알리지 않고 멈춰 있으면 읽을 시간이 지난 뒤 끝난 것으로 본다.
 */
function speakWithDevice(sentences: string[], rate: number, seq: number, done: (ok: boolean) => void) {
  if (!speechSupported()) return done(true);
  let ended = false;
  const end = (ok: boolean) => {
    if (ended) return;
    ended = true;
    clearTimeout(watchdog);
    done(ok);
  };
  const watchdog = setTimeout(() => {
    if (seq !== utteranceSeq) return end(false);
    window.speechSynthesis.cancel();
    end(true);
  }, (readingTimeMs(sentences.join(" ")) / Math.max(rate, 0.5)) * 2 + 5000);
  const voice = pickKoreanVoice();
  const sayAt = (i: number) => {
    if (seq !== utteranceSeq) return end(false);
    if (i >= sentences.length) return end(true);
    const u = new SpeechSynthesisUtterance(sentences[i]!);
    u.lang = "ko-KR";
    u.rate = rate;
    if (voice) u.voice = voice;
    u.onend = () => sayAt(i + 1);
    u.onerror = () => end(false);
    window.speechSynthesis.speak(u);
  };
  sayAt(0);
}

/** 문장 끝(. ? ! 。)에서 나눈다. 너무 짧은 조각은 앞 문장에 붙인다 */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.?!。]+[.?!。]*\s*/g)?.map((p) => p.trim()).filter(Boolean) ?? [];
  const out: string[] = [];
  for (const p of parts) {
    if (out.length > 0 && p.length < 6) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out.length ? out : [text];
}

export const MIN_RATE = 0.6;
export const MAX_RATE = 1.6;
export const RATE_STEP = 0.15;

export function clampRate(rate: number): number {
  return Math.round(Math.max(MIN_RATE, Math.min(MAX_RATE, rate)) * 100) / 100;
}
