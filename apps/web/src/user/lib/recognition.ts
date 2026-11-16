/**
 * 브라우저 음성 인식 (Web Speech API).
 * 지원하지 않는 브라우저나 마이크 권한이 거부된 경우에는 글 입력으로 같은 기능을 쓸 수 있어야 한다.
 * 화면이 꺼지거나 앱이 뒤로 가면 인식이 멈출 수 있다 (설계 문서 10장).
 */

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
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

/** 듣기를 시작한다. 말을 알아들을 때마다 onText를 부른다. 멈출 때까지 계속 듣는다. */
export function startListening(handlers: { onText(text: string): void; onError(error: ListenError): void }): Listener | null {
  const Ctor = getConstructor();
  if (!Ctor) {
    handlers.onError("unsupported");
    return null;
  }
  let active = true;
  let stopTimer = () => {};
  let recognition: RecognitionInstance;
  try {
    recognition = new Ctor();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last?.[0]?.transcript?.trim();
      if (text) handlers.onText(text);
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
    handlers.onError("failed");
    return null;
  }
  return {
    stop() {
      active = false;
      stopTimer();
      try {
        recognition.stop();
      } catch {
        // 이미 멈춘 경우
      }
    },
  };
}
