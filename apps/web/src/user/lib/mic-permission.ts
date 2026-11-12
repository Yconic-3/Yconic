/**
 * 마이크 사용 권한.
 * 브라우저는 사이트가 처음 마이크를 쓰려 할 때 "마이크 사용을 허용할까요?"라고 묻는다.
 * 화면을 보지 않는 사용자는 이 창이 왜 뜨는지 모를 수 있으므로, 앱이 먼저 말로 알리고 나서 묻게 한다.
 * 한 번 차단하면 브라우저가 다시 묻지 않으므로, 설정에서 다시 허용하는 방법을 알려 준다.
 */

export type MicPermission =
  /** 허용됨 */
  | "granted"
  /** 아직 묻지 않음 (누르면 브라우저가 묻는다) */
  | "prompt"
  /** 차단됨 (브라우저 설정에서 다시 허용해야 한다) */
  | "denied"
  /** 이 기기에 마이크가 없음 */
  | "no-device"
  /** https가 아니라서 브라우저가 마이크를 막음 */
  | "insecure"
  /** 이 브라우저는 마이크나 음성 인식을 지원하지 않음 */
  | "unsupported"
  /** 브라우저가 권한 상태를 알려 주지 않음 (눌러 보면 안다) */
  | "unknown";

export interface MicPermissionText {
  /** "마이크 권한: …" 뒤에 붙는 짧은 상태 */
  label: string;
  /** 무엇을 하면 되는지 */
  help: string;
  /** "마이크 사용 허용하기" 버튼을 보여 줄지 */
  canRequest: boolean;
}

/** 상태마다 화면에 쓰고 읽어 줄 말 */
export function micPermissionText(state: MicPermission): MicPermissionText {
  switch (state) {
    case "granted":
      return { label: "허용됨", help: "마이크를 쓸 수 있습니다. 큰 버튼을 누르고 말하세요.", canRequest: false };
    case "prompt":
    case "unknown":
      return {
        label: state === "prompt" ? "아직 묻지 않음" : "확인 전",
        help: "말로 쓰려면 마이크 사용을 허용해 주세요. 아래 버튼을 누르면 브라우저가 마이크를 써도 되는지 묻습니다. 그때 허용을 누르세요.",
        canRequest: true,
      };
    case "denied":
      return {
        label: "차단됨",
        help: "이 사이트의 마이크가 차단되어 있습니다. 주소창 왼쪽의 자물쇠 또는 사이트 정보 아이콘을 누르고, 마이크를 허용으로 바꾼 뒤 페이지를 새로 고쳐 주세요. 그동안은 말 대신 글로 입력할 수 있습니다.",
        canRequest: true,
      };
    case "no-device":
      return { label: "마이크 없음", help: "연결된 마이크를 찾지 못했습니다. 마이크나 이어폰을 연결한 뒤 다시 눌러 주세요. 그동안은 글로 입력할 수 있습니다.", canRequest: true };
    case "insecure":
      return { label: "쓸 수 없음", help: "보안 연결(https)이 아닌 주소에서는 브라우저가 마이크를 막습니다. https 주소로 접속하거나, 글로 입력해 주세요.", canRequest: false };
    case "unsupported":
      return { label: "지원 안 함", help: "이 브라우저는 음성 인식을 지원하지 않습니다. 크롬이나 엣지에서 열거나, 글로 입력해 주세요.", canRequest: false };
  }
}

function speechRecognitionAvailable(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

/** 브라우저가 마이크를 쓸 수 있는 환경인지. 쓸 수 없으면 그 이유 */
function environmentProblem(): MicPermission | null {
  if (typeof window === "undefined") return "unknown";
  if (!window.isSecureContext) return "insecure";
  if (!navigator.mediaDevices?.getUserMedia || !speechRecognitionAvailable()) return "unsupported";
  return null;
}

/**
 * 지금 권한 상태를 읽고, 바뀔 때마다 알린다. 멈출 때 부를 함수를 돌려준다.
 * 사파리처럼 권한 상태를 알려 주지 않는 브라우저는 "unknown"이다.
 */
export function watchMicPermission(onChange: (state: MicPermission) => void): () => void {
  const problem = environmentProblem();
  if (problem) {
    onChange(problem);
    return () => undefined;
  }
  let status: PermissionStatus | null = null;
  let stopped = false;
  const update = () => {
    if (!stopped && status) onChange(status.state as MicPermission);
  };
  navigator.permissions
    ?.query({ name: "microphone" as PermissionName })
    .then((s) => {
      status = s;
      update();
      s.addEventListener("change", update);
    })
    .catch(() => !stopped && onChange("unknown"));
  if (!navigator.permissions) onChange("unknown");
  return () => {
    stopped = true;
    status?.removeEventListener("change", update);
  };
}

/**
 * 브라우저가 마이크 사용을 묻게 한다. 허용하면 바로 마이크를 놓아 둔다 (듣기는 음성 인식이 따로 한다).
 * 이미 차단되어 있으면 브라우저는 묻지 않고 바로 "denied"가 된다.
 */
export async function requestMicPermission(): Promise<MicPermission> {
  const problem = environmentProblem();
  if (problem) return problem;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return "granted";
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") return "denied";
    if (name === "NotFoundError" || name === "OverconstrainedError") return "no-device";
    return "unknown";
  }
}
