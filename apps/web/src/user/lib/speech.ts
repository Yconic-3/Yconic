import { createEchoFilter } from "./echo";

/**
 * 브라우저 내장 음성 합성으로 안내를 읽는다.
 * 구간에 생성된 음성 파일(`tts.audioUrl`)이 있으면 그 파일을 재생하고, 없으면 브라우저 음성으로 읽는다.
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

  if (!state.enabled || (!speechSupported() && !isPlayableAudioUrl(opts.audioUrl))) {
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
      const audio = new Audio(opts.audioUrl ?? undefined);
      audio.playbackRate = rate;
      currentAudio = audio;
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.play().catch(() => done(false));
    });
  }

  // 긴 글은 문장마다 나눠 읽는다. 브라우저 음성은 긴 글을 읽다가 멈추거나 끝을 알리지 않을 때가 있다.
  // 오류가 나면 다시 읽지 않고 끝낸다. 끝을 알리지 않고 멈춰 있으면 읽을 시간이 지난 뒤 끝난 것으로 본다.
  const sentences = splitSentences(text);
  currentPromise = new Promise((resolve) => {
    const done = finish(resolve);
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
    }, (readingTimeMs(text) / Math.max(rate, 0.5)) * 2 + 5000);
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
  });
  return currentPromise;
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
