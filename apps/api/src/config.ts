import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface ApiConfig {
  port: number;
  /** 이 주소에서 오는 브라우저 요청만 받는다 (CORS) */
  webOrigins: string[];
  /** 영상 재생 주소를 만들 때 쓰는 API 서버의 바깥 주소 */
  publicUrl: string;
  /** 올린 영상 파일을 두는 폴더. 나중에 S3 호환 저장소로 바꾼다 */
  storageDir: string;
  maxVideoBytes: number;
  sessionDays: number;
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
    publicUrl: process.env.API_PUBLIC_URL ?? `http://localhost:${port}`,
    storageDir: process.env.STORAGE_DIR ?? join(apiRoot, "storage"),
    maxVideoBytes: 2 * 1024 * 1024 * 1024,
    sessionDays: 30,
    jobStageMs: Number(process.env.JOB_STAGE_MS ?? 2500),
    ttsMs: Number(process.env.TTS_MS ?? 3000),
    workerIntervalMs: Number(process.env.WORKER_INTERVAL_MS ?? 1000),
    ...overrides,
  };
}

export function videosDir(config: ApiConfig): string {
  return join(config.storageDir, "videos");
}
