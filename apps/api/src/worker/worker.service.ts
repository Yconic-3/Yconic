import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { AnalysisStage, VideoAnalyzer } from "@yconic/content-analysis";
import { contentJobs, contents, segments, videos, type Database } from "@yconic/database";
import { EDITABLE_STATUSES, type ContentJobStatus, type VideoAnalysisResult } from "@yconic/shared-types";
import { and, eq, lte, notInArray } from "drizzle-orm";
import { join } from "node:path";
import { newId } from "../common/ids";
import { videosDir, type ApiConfig } from "../config";
import { WORKER_ACTOR, writeAudit, type Db } from "../content/content.store";
import { ANALYZER, CONFIG, DB } from "../tokens";

const JOB_STAGES: ContentJobStatus[] = ["QUEUED", "ANALYZING_VIDEO", "EXTRACTING_STEPS", "GENERATING_SCRIPT", "GENERATING_TTS"];
const FINISHED = ["COMPLETED", "FAILED"] as const;
const RECOGNITION_FAILED = "영상에서 사람의 동작을 인식하지 못했습니다. 전신이 밝게 나오는 영상인지 확인해 주세요.";
const REANALYZE_BLOCKED =
  "그 사이 콘텐츠가 검수 중이거나 승인되어 분석 결과를 반영하지 못했습니다. 초안 또는 수정 요청 상태에서 다시 시도해 주세요.";

type JobRow = typeof contentJobs.$inferSelect;

/**
 * content-worker (설계 문서 7장). AI 제작 작업과 음성(TTS) 생성 요청을 처리한다.
 * - 모의 분석기: 바로 끝나므로 단계마다 일정 시간(jobStageMs)이 걸리는 것처럼 진행한다.
 * - 실제 분석기(analyzer.slow, Claude 영상 분석): 몇 분 걸리므로 분석을 따로 돌리고, 분석기가 알려 주는
 *   진행 단계를 작업 상태로 보여 준다. 분석하는 동안 DB 행을 잠그지 않는다.
 */
@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("content-worker");
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  /** 이 서버에서 지금 돌고 있는 실제 분석 (작업 ID → 끝날 때의 약속) */
  private readonly analyzing = new Map<string, Promise<void>>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(ANALYZER) private readonly analyzer: VideoAnalyzer,
  ) {}

  onModuleInit() {
    if (this.config.workerIntervalMs <= 0) return;
    this.timer = setInterval(() => void this.tick(), this.config.workerIntervalMs);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
    await Promise.allSettled(this.analyzing.values());
  }

  /** 실제 분석이 모두 끝날 때까지 기다린다 (테스트용) */
  async idle(): Promise<void> {
    await this.running;
    await Promise.allSettled(this.analyzing.values());
  }

  /** 할 일을 한 번 처리한다. 앞 처리가 끝나지 않았으면 그 처리를 기다린다. */
  tick(now = Date.now()): Promise<void> {
    this.running ??= this.process(now)
      .catch((e) => this.log.error(e instanceof Error ? e.stack : String(e)))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async process(now: number) {
    const active = await this.db.select({ id: contentJobs.id }).from(contentJobs).where(notInArray(contentJobs.status, [...FINISHED]));
    for (const { id } of active) {
      if (this.analyzer.slow) this.startSlowJob(id);
      else await this.advanceJob(id, now);
    }
    await this.finishTts(now);
  }

  private async advanceJob(id: string, now: number) {
    await this.db.transaction(async (tx) => {
      // 여러 API 서버가 떠 있어도 한 작업은 한 곳에서만 처리한다.
      const [job] = await tx.select().from(contentJobs).where(eq(contentJobs.id, id)).for("update", { skipLocked: true });
      if (!job || (FINISHED as readonly string[]).includes(job.status)) return;
      const at = new Date(now);
      const stageIndex = Math.floor((now - job.startedAt.getTime()) / this.config.jobStageMs);

      if (job.simulateFailure && stageIndex >= 1) {
        await tx.update(contentJobs).set({ status: "FAILED", progress: 20, failureReason: RECOGNITION_FAILED, updatedAt: at }).where(eq(contentJobs.id, id));
        return;
      }

      if (stageIndex < JOB_STAGES.length) {
        const status = JOB_STAGES[stageIndex]!;
        const progress = Math.round((stageIndex / JOB_STAGES.length) * 100);
        if (job.status !== status || job.progress !== progress) {
          await tx.update(contentJobs).set({ status, progress, updatedAt: at }).where(eq(contentJobs.id, id));
        }
        return;
      }

      const result = await this.analyzer.analyze(await this.analysisInput(tx, job));

      if (job.kind === "REANALYZE") {
        const ok = await this.applyReanalysis(tx, job, result, at);
        if (!ok) {
          await tx.update(contentJobs).set({ status: "FAILED", progress: 90, failureReason: REANALYZE_BLOCKED, updatedAt: at }).where(eq(contentJobs.id, id));
          return;
        }
      } else {
        const contentId = await this.createDraft(tx, job, result, at);
        await tx.update(contentJobs).set({ contentId }).where(eq(contentJobs.id, id));
      }
      await tx.update(contentJobs).set({ status: "COMPLETED", progress: 100, completedAt: at, updatedAt: at }).where(eq(contentJobs.id, id));
    });
  }

  /** 분석기에 넘길 영상 정보 (실제 분석기는 저장된 파일을 읽는다) */
  private async analysisInput(db: Db, job: JobRow) {
    const [video] = await db.select().from(videos).where(eq(videos.id, job.videoId));
    return {
      videoId: job.videoId,
      durationSec: video?.durationSec ?? 0,
      title: job.title,
      category: job.category,
      difficulty: job.difficulty,
      requestNote: job.requestNote,
      filePath: video?.storageKey ? join(videosDir(this.config), video.storageKey) : null,
    };
  }

  /**
   * 실제 분석기로 작업 하나를 처리한다. 이미 이 서버에서 돌고 있으면 아무것도 하지 않는다.
   * 서버가 다시 켜지면 끝나지 않은 작업을 처음부터 다시 분석한다.
   */
  private startSlowJob(id: string) {
    if (this.analyzing.has(id)) return;
    const run = this.runSlowJob(id)
      .catch((e) => this.log.error(e instanceof Error ? e.stack : String(e)))
      .finally(() => this.analyzing.delete(id));
    this.analyzing.set(id, run);
  }

  private async runSlowJob(id: string) {
    const [job] = await this.db.select().from(contentJobs).where(eq(contentJobs.id, id));
    if (!job || (FINISHED as readonly string[]).includes(job.status)) return;
    const setStage = async (status: AnalysisStage | "QUEUED", progress: number) => {
      await this.db
        .update(contentJobs)
        .set({ status, progress, updatedAt: new Date() })
        .where(and(eq(contentJobs.id, id), notInArray(contentJobs.status, [...FINISHED])));
    };
    const fail = async (reason: string) => {
      await this.db.update(contentJobs).set({ status: "FAILED", failureReason: reason, updatedAt: new Date() }).where(eq(contentJobs.id, id));
    };

    await setStage("ANALYZING_VIDEO", 5);
    let result: VideoAnalysisResult;
    try {
      const input = await this.analysisInput(this.db, job);
      result = await this.analyzer.analyze(input, (stage, progress, message) => {
        this.log.log(`[${id}] ${message}`);
        void setStage(stage, progress);
      });
    } catch (e) {
      await fail(e instanceof Error ? e.message : "영상 분석에 실패했습니다.");
      return;
    }

    await this.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(contentJobs).where(eq(contentJobs.id, id)).for("update");
      if (!locked || (FINISHED as readonly string[]).includes(locked.status)) return;
      const at = new Date();
      if (locked.kind === "REANALYZE") {
        if (!(await this.applyReanalysis(tx, locked, result, at))) {
          await tx.update(contentJobs).set({ status: "FAILED", progress: 90, failureReason: REANALYZE_BLOCKED, updatedAt: at }).where(eq(contentJobs.id, id));
          return;
        }
      } else {
        const contentId = await this.createDraft(tx, locked, result, at);
        await tx.update(contentJobs).set({ contentId }).where(eq(contentJobs.id, id));
      }
      await tx.update(contentJobs).set({ status: "COMPLETED", progress: 100, completedAt: at, updatedAt: at }).where(eq(contentJobs.id, id));
    });
  }

  private segmentRows(job: JobRow, contentId: string, result: VideoAnalysisResult, at: Date): (typeof segments.$inferInsert)[] {
    // 모의 분석기는 음성 파일까지 만든 것처럼 표시한다. 실제 분석기는 아직 음성 파일을 만들지 않으므로
    // 사용자 기기가 안내문을 읽는다 (관리자 화면에서 음성 생성을 요청할 수 있다).
    const mockTts = !this.analyzer.slow;
    return result.segments.map((s, i) => ({
      id: newId("s"),
      contentId,
      position: i + 1,
      kind: s.kind,
      startSec: s.startSec,
      endSec: s.endSec,
      title: s.title,
      instruction: s.instruction,
      voiceGuide: s.voiceGuide,
      conciseGuide: s.conciseGuide,
      movements: s.movements,
      narration: s.narration ?? [],
      repetitions: s.repetitions,
      ...(mockTts
        ? { ttsStatus: "READY" as const, ttsAudioUrl: `mock://tts/${job.id}/${i + 1}`, ttsGeneratedForText: s.voiceGuide, ttsRequestedAt: at }
        : { ttsStatus: "NONE" as const }),
    }));
  }

  private analysisInfo(result: VideoAnalysisResult, at: Date) {
    return { provider: result.provider, model: result.model, analyzedAt: at.toISOString(), summary: result.summary, findings: result.findings };
  }

  private async createDraft(tx: Db, job: JobRow, result: VideoAnalysisResult, at: Date): Promise<string> {
    const contentId = newId("c");
    const note = [job.requestNote ? `제작 요청 사항: ${job.requestNote}` : "", ...result.warnings.map((w) => `분석기 알림: ${w}`)].filter(Boolean).join("\n");
    await tx.insert(contents).values({
      id: contentId,
      title: job.title,
      // 요약은 사용자에게 읽어 주는 문장이다. 분석기 설명이 사용자에게 가지 않도록 비워 두고 편집자가 쓰게 한다.
      summary: "",
      category: job.category,
      difficulty: job.difficulty,
      tags: result.suggestedTags,
      precautions: result.suggestedPrecautions,
      videoId: job.videoId,
      analysis: this.analysisInfo(result, at),
      status: "DRAFT",
      aiGenerated: true,
      internalNote: note,
      createdBy: job.requestedBy,
      updatedBy: job.requestedBy,
      createdAt: at,
      updatedAt: at,
    });
    const rows = this.segmentRows(job, contentId, result, at);
    if (rows.length) await tx.insert(segments).values(rows);
    await writeAudit(tx, WORKER_ACTOR, "CONTENT_CREATED", "CONTENT", contentId, `AI 초안 생성 완료: ${job.title} (구간 ${rows.length}개)`);
    return contentId;
  }

  private async applyReanalysis(tx: Db, job: JobRow, result: VideoAnalysisResult, at: Date): Promise<boolean> {
    if (!job.contentId) return false;
    const [content] = await tx.select().from(contents).where(eq(contents.id, job.contentId)).for("update");
    if (!content || !EDITABLE_STATUSES.includes(content.status)) return false;
    const rows = this.segmentRows(job, content.id, result, at);
    await tx.delete(segments).where(eq(segments.contentId, content.id));
    if (rows.length) await tx.insert(segments).values(rows);
    await tx
      .update(contents)
      .set({
        analysis: this.analysisInfo(result, at),
        aiGenerated: true,
        internalNote: job.requestNote ? [content.internalNote, `다시 분석 요청 사항: ${job.requestNote}`].filter(Boolean).join("\n") : content.internalNote,
        updatedBy: job.requestedBy,
        updatedAt: at,
        version: content.version + 1,
      })
      .where(eq(contents.id, content.id));
    await writeAudit(tx, WORKER_ACTOR, "CONTENT_REANALYZED", "CONTENT", content.id, `다시 분석 반영: 구간 ${rows.length}개로 교체`);
    return true;
  }

  /** 요청한 지 ttsMs가 지난 음성 생성을 끝낸다 (모의 TTS) */
  private async finishTts(now: number) {
    const due = new Date(now - this.config.ttsMs);
    const rows = await this.db
      .select({ id: segments.id, text: segments.ttsPendingText })
      .from(segments)
      .where(and(eq(segments.ttsStatus, "GENERATING"), lte(segments.ttsRequestedAt, due)));
    for (const s of rows) {
      await this.db
        .update(segments)
        .set({ ttsStatus: "READY", ttsAudioUrl: `mock://tts/${s.id}/${now}`, ttsGeneratedForText: s.text, ttsPendingText: null })
        .where(and(eq(segments.id, s.id), eq(segments.ttsStatus, "GENERATING")));
    }
  }
}
