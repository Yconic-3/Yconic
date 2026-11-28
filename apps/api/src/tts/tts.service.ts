import { Inject, Injectable } from "@nestjs/common";
import type { TtsConfig, TtsResponse } from "@yconic/shared-types";
import { createHash } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ApiError } from "../common/errors";
import { ttsDir, type ApiConfig } from "../config";
import { CONFIG, TTS } from "../tokens";
import type { SpeechSynthesizer } from "./synthesizer";

const MINUTE_MS = 60_000;
/** 이만큼 지나도록 다시 쓰이지 않은 음성 파일은 지운다 */
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 서버 목소리 (docs/decisions/0021).
 * 글을 받아 음성 파일을 만들고 그 주소를 돌려준다. 같은 글은 한 번만 만든다 (파일로 남겨 다시 쓴다).
 * 로그인 없이도 쓰는 기능이라, 남이 음성 만들기를 공짜로 가져다 쓰지 못하게 한도를 둔다:
 * 한 번에 받는 글자 수, 한 곳(IP)의 1분 요청 수, 하루에 새로 만드는 글자 수.
 */
@Injectable()
export class TtsService {
  private readonly making = new Map<string, Promise<void>>();
  private readonly requestsByIp = new Map<string, number[]>();
  private day = { date: "", chars: 0 };
  private swept = false;

  constructor(
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(TTS) private readonly synthesize: SpeechSynthesizer | null,
  ) {}

  info(): TtsConfig {
    return { enabled: this.synthesize !== null, maxChars: this.config.ttsMaxChars };
  }

  private allow(ip: string, now: number): boolean {
    const recent = (this.requestsByIp.get(ip) ?? []).filter((t) => now - t < MINUTE_MS);
    if (recent.length >= this.config.ttsPerIpPerMinute) return false;
    recent.push(now);
    this.requestsByIp.set(ip, recent);
    if (this.requestsByIp.size > 5000) {
      for (const [key, times] of this.requestsByIp) if (times.every((t) => now - t >= MINUTE_MS)) this.requestsByIp.delete(key);
    }
    return true;
  }

  /** 오래 쓰이지 않은 파일을 지운다 (서버를 켠 뒤 처음 한 번) */
  private async sweep(now: number): Promise<void> {
    if (this.swept) return;
    this.swept = true;
    const dir = ttsDir(this.config);
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      const file = join(dir, name);
      const info = await stat(file).catch(() => null);
      if (info && now - info.mtimeMs > KEEP_MS) await rm(file, { force: true });
    }
  }

  async urlFor(rawText: unknown, ip: string): Promise<TtsResponse> {
    if (!this.synthesize) throw new ApiError("NOT_FOUND", "서버 목소리가 꺼져 있습니다.");
    if (typeof rawText !== "string") throw new ApiError("VALIDATION", "읽을 글을 보내 주세요.");
    const text = rawText.replace(/\s+/g, " ").trim();
    if (!text) throw new ApiError("VALIDATION", "읽을 글을 보내 주세요.");
    if (text.length > this.config.ttsMaxChars) throw new ApiError("VALIDATION", `한 번에 ${this.config.ttsMaxChars}자까지 읽을 수 있습니다.`);
    const now = Date.now();
    if (!this.allow(ip, now)) throw new ApiError("FORBIDDEN", "요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.");

    // 목소리가 바뀌면 파일도 달라져야 하므로 이름에 함께 넣는다
    const key = createHash("sha256").update(`${this.config.ttsVoice}\n${text}`).digest("hex").slice(0, 32);
    const dir = ttsDir(this.config);
    const file = join(dir, `${key}.mp3`);
    const url = `${this.config.publicUrl.replace(/\/+$/, "")}/media/tts/${key}.mp3`;
    if (await stat(file).catch(() => null)) return { url };

    // 같은 글을 동시에 여러 번 물어도 한 번만 만든다
    let job = this.making.get(key);
    if (!job) {
      const date = new Date(now).toISOString().slice(0, 10);
      if (this.day.date !== date) this.day = { date, chars: 0 };
      if (this.day.chars + text.length > this.config.ttsDailyChars) {
        throw new ApiError("FORBIDDEN", "오늘 서버 목소리로 읽을 수 있는 양을 다 썼습니다.");
      }
      this.day.chars += text.length;
      job = (async () => {
        await mkdir(dir, { recursive: true });
        await this.sweep(now);
        const audio = await this.synthesize!(text);
        // 다 쓴 뒤에 이름을 바꿔, 쓰다 만 파일이 재생되지 않게 한다
        const tmp = join(dir, `${key}.${process.pid}.tmp`);
        await writeFile(tmp, audio);
        await rename(tmp, file);
      })().finally(() => this.making.delete(key));
      this.making.set(key, job);
    }
    try {
      await job;
    } catch (e) {
      console.error("[api] 음성을 만들지 못했습니다:", e instanceof Error ? e.message : e);
      throw new ApiError("UNKNOWN", "음성을 만들지 못했습니다.");
    }
    return { url };
  }
}
