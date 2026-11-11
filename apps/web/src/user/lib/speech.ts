/**
 * 브라우저 내장 음성 합성으로 안내를 읽는다.
 * 구간에 생성된 음성 파일(`tts.audioUrl`)이 있으면 그 파일을 재생하고, 없으면 브라우저 음성으로 읽는다.
 */
export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickKoreanVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith("ko")) ?? null;
}

let currentAudio: HTMLAudioElement | null = null;
// 발화마다 번호를 붙여, 끊긴 발화가 뒤늦게 "끝났다"고 알리지 못하게 한다.
let utteranceSeq = 0;

export function stopSpeaking() {
  utteranceSeq++;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** 재생할 수 있는 음성 파일 주소인지 (모의 데이터의 mock:// 주소는 재생할 수 없다) */
export function isPlayableAudioUrl(url: string | null | undefined): url is string {
  return !!url && /^(https?:|blob:|\/)/.test(url);
}

/**
 * 이전 발화를 끊고 새로 읽는다.
 * 끝까지 읽으면 true, 중간에 끊기거나 읽을 수 없으면 false로 끝난다.
 */
export function speak(text: string, opts: { rate?: number; audioUrl?: string | null } = {}): Promise<boolean> {
  stopSpeaking();
  const seq = utteranceSeq;
  const rate = opts.rate ?? 1;

  if (isPlayableAudioUrl(opts.audioUrl)) {
    return new Promise((resolve) => {
      const audio = new Audio(opts.audioUrl ?? undefined);
      audio.playbackRate = rate;
      currentAudio = audio;
      audio.onended = () => resolve(seq === utteranceSeq);
      audio.onerror = () => resolve(false);
      audio.play().catch(() => resolve(false));
    });
  }

  if (!speechSupported() || !text.trim()) return Promise.resolve(false);
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = rate;
    const voice = pickKoreanVoice();
    if (voice) u.voice = voice;
    u.onend = () => resolve(seq === utteranceSeq);
    u.onerror = () => resolve(false);
    window.speechSynthesis.speak(u);
  });
}

export const MIN_RATE = 0.6;
export const MAX_RATE = 1.6;
export const RATE_STEP = 0.15;

export function clampRate(rate: number): number {
  return Math.round(Math.max(MIN_RATE, Math.min(MAX_RATE, rate)) * 100) / 100;
}
