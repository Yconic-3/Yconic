import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 영상에서 분석 재료를 꺼낸다 (서버 전용).
 *  - 장면: ffmpeg로 일정 간격마다 작은 JPEG를 뽑는다. Claude가 이 장면들을 본다.
 *  - 내레이션: faster-whisper(Python)로 강사의 말을 받아 적는다. Claude는 소리를 듣지 못하므로 글로 바꿔 준다.
 */

export interface Frame {
  /** 영상에서의 시각 (초) */
  atSec: number;
  jpegBase64: string;
}

export interface TranscriptLine {
  start: number;
  end: number;
  text: string;
}

export interface MediaTools {
  extractFrames(filePath: string, durationSec: number): Promise<Frame[]>;
  transcribe(filePath: string): Promise<TranscriptLine[]>;
}

export interface LocalMediaOptions {
  ffmpeg?: string;
  python?: string;
  /** faster-whisper 모델 이름 (small이 한국어 정확도와 속도의 균형이 좋다) */
  whisperModel?: string;
  /** 장면을 최대 몇 장 뽑을지 (Claude 한 번에 보낼 수 있는 양과 비용을 정한다) */
  maxFrames?: number;
  /** 장면 가로 크기 (픽셀) */
  frameWidth?: number;
}

const here = dirname(fileURLToPath(import.meta.url));
const TRANSCRIBE_SCRIPT = join(here, "..", "..", "scripts", "transcribe.py");

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", HF_HUB_DISABLE_SYMLINKS_WARNING: "1" },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${cmd}이(가) ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않았습니다.`));
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`${cmd}을(를) 실행하지 못했습니다: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} 실패 (code ${code}): ${stderr.trim().split("\n").slice(-3).join(" ")}`));
    });
  });
}

/** 장면 간격: 최대 장 수를 넘지 않게, 2초보다 촘촘하지 않게 */
export function frameInterval(durationSec: number, maxFrames: number): number {
  return Math.max(2, Math.ceil(durationSec / maxFrames));
}

export function createLocalMediaTools(opts: LocalMediaOptions = {}): MediaTools {
  const ffmpeg = opts.ffmpeg ?? "ffmpeg";
  const python = opts.python ?? "python";
  const whisperModel = opts.whisperModel ?? "small";
  const maxFrames = opts.maxFrames ?? 90;
  const width = opts.frameWidth ?? 512;

  return {
    async extractFrames(filePath, durationSec) {
      const dir = await mkdtemp(join(tmpdir(), "yconic-frames-"));
      try {
        const every = frameInterval(durationSec, maxFrames);
        await run(
          ffmpeg,
          ["-hide_banner", "-loglevel", "error", "-i", filePath, "-vf", `fps=1/${every},scale=${width}:-2`, "-q:v", "5", join(dir, "f_%04d.jpg")],
          5 * 60_000,
        );
        const files = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
        const frames: Frame[] = [];
        for (const [i, f] of files.slice(0, maxFrames).entries()) {
          frames.push({ atSec: i * every, jpegBase64: (await readFile(join(dir, f))).toString("base64") });
        }
        if (frames.length === 0) throw new Error("영상에서 장면을 뽑지 못했습니다.");
        return frames;
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },

    async transcribe(filePath) {
      const { stdout } = await run(python, [TRANSCRIBE_SCRIPT, filePath, whisperModel], 30 * 60_000);
      const line = stdout.trim().split("\n").pop() ?? "";
      const parsed = JSON.parse(line) as { segments?: TranscriptLine[] };
      return (parsed.segments ?? []).filter((s) => typeof s.text === "string" && s.text.trim());
    },
  };
}
