/**
 * 브라우저 음성 인식 (Web Speech API).
 * 지원하지 않는 브라우저나 마이크 권한이 거부된 경우에는 글 입력으로 같은 기능을 쓸 수 있어야 한다.
 * 화면이 꺼지거나 앱이 뒤로 가면 인식이 멈출 수 있다 (설계 문서 10장).
 *
 * 말을 중간에 끊지 않는다 (docs/decisions/0012):
 * 브라우저는 숨을 고르는 짧은 쉼에도 '끝난 말'을 돌려준다. 그래서 끝난 말을 모아 두었다가
 * 새 말이 endOfSpeechMs 동안 들어오지 않을 때 한 번에 넘긴다.
 * 말하는 중인 것(중간 결과)은 onSpeaking으로 바로 알려, 앱이 읽던 말을 멈추고 들을 수 있게 한다.
 */

interface RecognitionAlternative {
  transcript: string;
  confidence?: number;
}

interface RecognitionResult extends ArrayLike<RecognitionAlternative> {
  isFinal: boolean;
}

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

interface RecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => RecognitionInstance;

function getConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function recognitionSupported(): boolean {
  return getConstructor() !== null;
}

export interface Listener {
  stop(): void;
}

export type ListenError = "unsupported" | "denied" | "failed";

/** 말이 끝났다고 보는 쉼 (밀리초). 숨 고르기·생각하는 짧은 쉼에서는 끊지 않는다 */
export const END_OF_SPEECH_MS = 1300;

/**
 * 말이 끝났다고 보는 쉼. 숫자로 정하거나, 지금까지 들은 말을 보고 정한다
 * (더 이을 말이 없는 짧은 말은 덜, 덜 끝난 것 같은 말은 더 기다린다: turn-taking.ts, docs/decisions/0019).
 */
export type EndOfSpeech = number | ((heardSoFar: string) => number);

/**
 * 모아 둔 말을 언제 넘길지 정한다 (브라우저와 떼어 테스트할 수 있게).
 * push: 끝난 말 조각, touch: 아직 말하는 중(중간 결과). flush 시각이 되면 모은 말을 돌려준다.
 */
export function createUtteranceBuffer(endOfSpeechMs: EndOfSpeech = END_OF_SPEECH_MS) {
  let parts: string[] = [];
  let lastAt = 0;
  return {
    push(text: string, now: number) {
      const t = text.trim();
      if (t) parts.push(t);
      lastAt = now;
    },
    touch(now: number) {
      lastAt = now;
    },
    /** 말이 끝났으면 모은 말을 돌려주고 비운다. 아직이면 null */
    take(now: number): string | null {
      if (parts.length === 0) return null;
      const text = parts.join(" ").replace(/\s+/g, " ").trim();
      const wait = typeof endOfSpeechMs === "function" ? endOfSpeechMs(text) : endOfSpeechMs;
      if (now - lastAt < wait) return null;
      parts = [];
      return text || null;
    },
    pending(): boolean {
      return parts.length > 0;
    },
  };
}

/**
 * 듣기를 시작한다. 한 사람이 말을 마칠 때마다(쉼이 endOfSpeechMs 넘게) onText를 부른다. 멈출 때까지 계속 듣는다.
 * onSpeaking: 사람이 말하기 시작했거나 말하는 중 (중간 결과 글자와 함께)
 */
export function startListening(handlers: {
  onText(text: string): void;
  onError(error: ListenError): void;
  onSpeaking?(partial: string): void;
  endOfSpeechMs?: EndOfSpeech;
}): Listener | null {
  const Ctor = getConstructor();
  if (!Ctor) {
    handlers.onError("unsupported");
    return null;
  }
  let active = true;
  let stopTimer = () => {};
  const buffer = createUtteranceBuffer(handlers.endOfSpeechMs);
  // 쉼이 끝났는지 짧게 자주 본다
  const flushTimer = setInterval(() => {
    const text = buffer.take(Date.now());
    if (text) handlers.onText(text);
  }, 150);
  let recognition: RecognitionInstance;
  try {
    recognition = new Ctor();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const now = Date.now();
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? "";
        if (!result) continue;
        if (result.isFinal) buffer.push(text, now);
        else {
          buffer.touch(now);
          if (text.trim()) handlers.onSpeaking?.(text.trim());
        }
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        active = false;
        handlers.onError("denied");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        handlers.onError("failed");
      }
    };
    // 브라우저가 조용할 때나 잠깐 끊겼을 때 인식을 끝내면 다시 시작해 계속 듣는다.
    // 바로 다시 시작하면 브라우저가 거절할 때가 있어, 조금 기다렸다가 될 때까지 다시 시도한다 (멈추라고 할 때까지).
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const restart = () => {
      timer = null;
      if (!active) return;
      try {
        recognition.start();
        retry = 0;
      } catch {
        retry++;
        timer = setTimeout(restart, Math.min(5000, 250 * 2 ** retry));
      }
    };
    recognition.onend = () => {
      if (!active || timer) return;
      timer = setTimeout(restart, 150);
    };
    recognition.start();
    stopTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
  } catch {
    clearInterval(flushTimer);
    handlers.onError("failed");
    return null;
  }
  return {
    stop() {
      active = false;
      stopTimer();
      clearInterval(flushTimer);
      try {
        recognition.stop();
      } catch {
        // 이미 멈춘 경우
      }
    },
  };
}
