import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface ApiConfig {
  port: number;
  /** 이 주소에서 오는 브라우저 요청만 받는다 (CORS) */
  webOrigins: string[];
  /** 영상 재생 주소를 만들 때 쓰는 API 서버의 바깥 주소 */
  publicUrl: string;
  /**
   * 공개 링크(Cloudflare)로 들어와도 관리자 계정 로그인을 허용할지 (기본: 막음, docs/decisions/0010).
   * 저장소가 공개라 예시 관리자 비밀번호도 공개되어 있으므로, 시연할 때만 잠깐 켠다.
   */
  publicLinkAdminLogin: boolean;
  /** 올린 영상 파일을 두는 폴더. 나중에 S3 호환 저장소로 바꾼다 */
  storageDir: string;
  /** 구글 로그인에 쓰는 클라이언트 ID (공개 값). 없으면 구글 로그인을 끈다 (docs/decisions/0016) */
  googleClientId: string | null;
  /** 구글로 로그인하면 최고 관리자가 되는 이메일 (소문자). 이 이메일은 이메일 가입을 받지 않는다 */
  superAdminEmails: string[];
  /** 이메일 가입을 받는지 */
  signup: boolean;
  /** 한 곳(IP)에서 한 시간에 받는 가입 수, 하루 전체 가입 수 */
  signupPerIpPerHour: number;
  signupPerDay: number;
  /** 로그인 화면에 체험 계정을 보여 줄지. 공개 서버에서는 끈다 (비밀번호가 공개되어 있다) */
  demoAccounts: boolean;
  /** 서버 목소리 (docs/decisions/0021): Google Cloud Text-to-Speech API 키. 없으면 끈다 (화면은 기기의 목소리로 읽는다) */
  googleTtsApiKey: string | null;
  /** 음성 이름 (예: ko-KR-Chirp3-HD-Kore, ko-KR-Neural2-A) */
  ttsVoice: string;
  /** 한 번에 받는 글자 수, 한 곳(IP)의 1분 요청 수, 하루에 새로 만드는 글자 수 (이미 만든 글은 세지 않는다) */
  ttsMaxChars: number;
  ttsPerIpPerMinute: number;
  ttsDailyChars: number;
  maxVideoBytes: number;
  /** 나눠 올릴 때 조각 하나의 크기. 서버 앞 프록시가 받는 크기(약 1MB)보다 작아야 한다 */
  uploadChunkBytes: number;
  /** 로그인 유지를 켰을 때 로그인이 남는 날 수. 쓰는 동안 계속 늘어난다 */
  sessionDays: number;
  /** 로그인 유지를 껐을 때 서버에 로그인이 남는 시간 */
  shortSessionHours: number;
  /** AI 제작 작업이 한 단계 진행하는 데 걸리는 시간 (모의 분석) */
  jobStageMs: number;
  /** 음성 파일 생성에 걸리는 시간 (모의 TTS) */
  ttsMs: number;
  /** 작업기가 할 일을 확인하는 간격 */
  workerIntervalMs: number;
}

export function loadConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  const port = Number(process.env.PORT ?? 4000);
  return {
    port,
    webOrigins: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((s) => s.trim()),
    // 영상 재생 주소의 앞부분. 기본은 웹앱이 대신 연결하는 /api 라서, localhost로 열든 공개 링크로 열든 영상이 나온다 (0010)
    publicUrl: process.env.API_PUBLIC_URL ?? "/api",
    publicLinkAdminLogin: process.env.PUBLIC_LINK_ADMIN_LOGIN === "allow",
    storageDir: process.env.STORAGE_DIR ?? join(apiRoot, "storage"),
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
    superAdminEmails: (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    signup: process.env.SIGNUP !== "off",
    signupPerIpPerHour: Number(process.env.SIGNUP_PER_IP_PER_HOUR ?? 10),
    signupPerDay: Number(process.env.SIGNUP_PER_DAY ?? 300),
    demoAccounts: process.env.DEMO_ACCOUNTS !== "off",
    googleTtsApiKey: process.env.GOOGLE_TTS_API_KEY?.trim() || null,
    ttsVoice: process.env.TTS_VOICE?.trim() || "ko-KR-Chirp3-HD-Kore",
    ttsMaxChars: Number(process.env.TTS_MAX_CHARS ?? 300),
    ttsPerIpPerMinute: Number(process.env.TTS_PER_IP_PER_MINUTE ?? 60),
    ttsDailyChars: Number(process.env.TTS_DAILY_CHARS ?? 30000),
    maxVideoBytes: 2 * 1024 * 1024 * 1024,
    uploadChunkBytes: Number(process.env.UPLOAD_CHUNK_BYTES ?? 768 * 1024),
    sessionDays: 30,
    shortSessionHours: 24,
    jobStageMs: Number(process.env.JOB_STAGE_MS ?? 2500),
    ttsMs: Number(process.env.TTS_MS ?? 3000),
    workerIntervalMs: Number(process.env.WORKER_INTERVAL_MS ?? 1000),
    ...overrides,
  };
}

export function videosDir(config: ApiConfig): string {
  return join(config.storageDir, "videos");
}

/** 서버가 만든 음성 파일을 두는 폴더 (/media/tts/ 로 공개한다) */
export function ttsDir(config: ApiConfig): string {
  return join(config.storageDir, "tts");
}

/** 나눠 올리는 중인 조각을 모아 두는 폴더 (바깥에 공개하지 않는다) */
export function uploadsDir(config: ApiConfig): string {
  return join(config.storageDir, "uploads");
}
