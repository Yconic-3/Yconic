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
// 소리를 끈 상태에서 '읽는 시간'을 기다리는 타이머와 그 끝 처리
let quietTimer: ReturnType<typeof setTimeout> | null = null;
let quietDone: ((finished: boolean) => void) | null = null;
// 발화마다 번호를 붙여, 끊긴 발화가 뒤늦게 "끝났다"고 알리지 못하게 한다.
let utteranceSeq = 0;

export function stopSpeaking() {
  utteranceSeq++;
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
  stopSpeaking();
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

  return new Promise((resolve) => {
    const done = finish(resolve);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = rate;
    const voice = pickKoreanVoice();
    if (voice) u.voice = voice;
    u.onend = () => done(true);
    u.onerror = () => done(false);
    window.speechSynthesis.speak(u);
  });
}

export const MIN_RATE = 0.6;
export const MAX_RATE = 1.6;
export const RATE_STEP = 0.15;

export function clampRate(rate: number): number {
  return Math.round(Math.max(MIN_RATE, Math.min(MAX_RATE, rate)) * 100) / 100;
}
