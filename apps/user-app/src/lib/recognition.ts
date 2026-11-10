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
    // 브라우저가 조용할 때 인식을 끝내면 다시 시작해 계속 듣는다.
    recognition.onend = () => {
      if (!active) return;
      try {
        recognition.start();
      } catch {
        active = false;
        handlers.onError("failed");
      }
    };
    recognition.start();
  } catch {
    handlers.onError("failed");
    return null;
  }
  return {
    stop() {
      active = false;
      try {
        recognition.stop();
      } catch {
        // 이미 멈춘 경우
      }
    },
  };
}
