import {
  CONTENT_STATUS_LABELS,
  CONTENT_TRANSITIONS,
  EDITABLE_STATUSES,
  canEditContent,
  canPerformAction,
  hasPermission,
  selfApprovalBlockedReason,
  type AdminUser,
  type AuditAction,
  type AuditLog,
  type ContentJob,
  type ContentJobStatus,
  type ExerciseContent,
  type ExerciseSegment,
  type ISODateString,
  type VideoAnalysisResult,
  type VideoAsset,
} from "@yconic/shared-types";
import { AdminApiError, type AdminApi } from "../admin-api";
import { createMockAnalyzer, type VideoAnalyzer } from "./mock-analyzer";
import { createSeedState, type MockJob, type MockState } from "./seed";
import type { VideoStore } from "./video-store";

export interface MockStorage {
  load(): MockState | null;
  save(state: MockState): void;
}

export interface VideoMetadataReader {
  (file: Blob): Promise<{ durationSec: number; width: number; height: number }>;
}

export interface MockAdminApiOptions {
  storage: MockStorage;
  videoStore: VideoStore;
  /** 영상 파일의 길이·해상도를 읽는다 (브라우저에서는 <video>로 읽는다) */
  readVideoMetadata: VideoMetadataReader;
  analyzer?: VideoAnalyzer;
  /** 현재 로그인한 관리자. null이면 모든 요청이 UNAUTHORIZED */
  getCurrentUser: () => AdminUser | null;
  now?: () => number;
  /** 네트워크 지연 흉내 (ms) */
  latencyMs?: number;
  /** 제작 작업이 한 단계 진행하는 데 걸리는 시간 (ms) */
  jobStageMs?: number;
  /** TTS 생성에 걸리는 시간 (ms) */
  ttsMs?: number;
}

/** 모의 제작 작업이 거치는 단계 순서 (설계 문서 7장) */
const JOB_STAGES: ContentJobStatus[] = ["QUEUED", "ANALYZING_VIDEO", "EXTRACTING_STEPS", "GENERATING_SCRIPT", "GENERATING_TTS"];

const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

const WORKER_ACTOR = { id: "content-worker", name: "content-worker", role: "EDITOR" as const };

export function isActiveJob(job: Pick<ContentJob, "status">): boolean {
  return job.status !== "COMPLETED" && job.status !== "FAILED";
}

/**
 * 브라우저 저장소를 백엔드 삼아 동작하는 모의 구현.
 * 권한 검사와 상태 전이 검증을 백엔드와 같은 규칙(shared-types)으로 수행해서,
 * 화면에서 버튼을 숨기는 것과 별개로 실제 요청도 거절되는지 확인할 수 있다.
 */
export function createMockAdminApi(opts: MockAdminApiOptions): AdminApi {
  const now = opts.now ?? (() => Date.now());
  const latencyMs = opts.latencyMs ?? 150;
  const jobStageMs = opts.jobStageMs ?? 2500;
  const ttsMs = opts.ttsMs ?? 3000;
  const analyzer = opts.analyzer ?? createMockAnalyzer();

  let state: MockState = opts.storage.load() ?? createSeedState(now());
  let seq = 0;
  const newId = (prefix: string) => `${prefix}-${now().toString(36)}-${(seq++).toString(36)}`;
  const iso = (ms = now()): ISODateString => new Date(ms).toISOString();
  const clone = <T>(v: T): T => structuredClone(v);

  function persist() {
    opts.storage.save(state);
  }

  async function withLatency<T>(fn: () => T | Promise<T>): Promise<T> {
    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
    return fn();
  }

  function requireUser(): AdminUser {
    const u = opts.getCurrentUser();
    if (!u) throw new AdminApiError("UNAUTHORIZED", "로그인이 필요합니다.");
    return u;
  }

  function requirePermission(user: AdminUser, p: Parameters<typeof hasPermission>[1]) {
    if (!hasPermission(user.role, p)) throw new AdminApiError("FORBIDDEN", "이 작업을 할 권한이 없습니다.");
  }

  function requireEditable(user: AdminUser, content: ExerciseContent) {
    if (!canEditContent(user.role, content.status)) {
      throw new AdminApiError("FORBIDDEN", `${CONTENT_STATUS_LABELS[content.status]} 상태의 콘텐츠는 수정할 수 없거나 수정 권한이 없습니다.`);
    }
  }

  function requireVersion(content: ExerciseContent, expected: number) {
    if (expected !== content.version) {
      throw new AdminApiError("CONFLICT", "다른 사람이 먼저 수정했습니다. 새로 고친 뒤 다시 시도해 주세요.");
    }
  }

  function findContent(id: string): ExerciseContent {
    const c = state.contents.find((x) => x.id === id);
    if (!c) throw new AdminApiError("NOT_FOUND", "콘텐츠를 찾을 수 없습니다.");
    return c;
  }

  function findJob(id: string): MockJob {
    const j = state.jobs.find((x) => x.id === id);
    if (!j) throw new AdminApiError("NOT_FOUND", "제작 작업을 찾을 수 없습니다.");
    return j;
  }

  function findVideo(id: string): VideoAsset {
    const v = state.videos.find((x) => x.id === id);
    if (!v) throw new AdminApiError("NOT_FOUND", "영상을 찾을 수 없습니다. 먼저 영상을 올려 주세요.");
    return v;
  }

  function activeReanalysis(contentId: string): MockJob | undefined {
    return state.jobs.find((j) => j.kind === "REANALYZE" && j.contentId === contentId && isActiveJob(j));
  }

  function audit(user: Pick<AdminUser, "id" | "name" | "role">, action: AuditAction, targetType: AuditLog["targetType"], targetId: string, summary: string) {
    state.auditLogs.push({
      id: newId("a"),
      action,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetType,
      targetId,
      summary,
      createdAt: iso(),
    });
  }

  function segmentsFromAnalysis(job: MockJob, result: VideoAnalysisResult): ExerciseSegment[] {
    return result.segments.map((s, i) => ({
      id: newId("s"),
      order: i + 1,
      kind: s.kind,
      startSec: s.startSec,
      endSec: s.endSec,
      title: s.title,
      instruction: s.instruction,
      voiceGuide: s.voiceGuide,
      repetitions: s.repetitions,
      // content-worker가 구간별 음성까지 만든다 (설계 문서 7장)
      tts: { status: "READY", audioUrl: `mock://tts/${job.id}/${i + 1}`, generatedForText: s.voiceGuide, failureReason: null },
    }));
  }

  function draftFromAnalysis(job: MockJob, result: VideoAnalysisResult, at: ISODateString): ExerciseContent {
    const noteParts = [job.requestNote ? `제작 요청 사항: ${job.requestNote}` : "", ...result.warnings.map((w) => `분석기 알림: ${w}`)].filter(Boolean);
    return {
      id: newId("c"),
      title: job.title,
      // 요약은 사용자에게 읽어 주는 문장이다. 분석기 설명이 사용자에게 가지 않도록 비워 두고 편집자가 쓰게 한다.
      summary: "",
      category: job.category,
      difficulty: job.difficulty,
      tags: result.suggestedTags,
      precautions: result.suggestedPrecautions,
      video: job.video,
      segments: segmentsFromAnalysis(job, result),
      analysis: { provider: result.provider, model: result.model, analyzedAt: at, summary: result.summary },
      status: "DRAFT",
      aiGenerated: true,
      internalNote: noteParts.join("\n"),
      reviewComment: null,
      createdBy: job.requestedBy,
      submittedBy: null,
      updatedBy: job.requestedBy,
      createdAt: at,
      updatedAt: at,
      publishedAt: null,
      version: 1,
    };
  }

  function failJob(job: MockJob, reason: string, progress: number, at: number) {
    job.status = "FAILED";
    job.progress = progress;
    job.failureReason = reason;
    job.updatedAt = iso(at);
  }

  /** 시간이 흐른 만큼 진행 중인 작업과 TTS 요청을 앞으로 보낸다. 조회할 때마다 호출한다. */
  async function advanceTime() {
    const t = now();
    let changed = false;

    for (const job of state.jobs) {
      if (!isActiveJob(job)) continue;
      const stageIndex = Math.floor((t - job.startedAtMs) / jobStageMs);
      if (job.simulateFailure && stageIndex >= 1) {
        failJob(job, "영상에서 사람의 동작을 인식하지 못했습니다. 전신이 밝게 나오는 영상인지 확인해 주세요.", 20, t);
        changed = true;
        continue;
      }
      if (stageIndex >= JOB_STAGES.length) {
        const result = await analyzer.analyze({
          videoId: job.video.id,
          durationSec: job.video.durationSec,
          title: job.title,
          category: job.category,
          difficulty: job.difficulty,
          requestNote: job.requestNote,
        });
        if (job.kind === "REANALYZE") {
          const content = state.contents.find((c) => c.id === job.contentId);
          if (!content || !EDITABLE_STATUSES.includes(content.status)) {
            failJob(job, "그 사이 콘텐츠가 검수 중이거나 승인되어 분석 결과를 반영하지 못했습니다. 초안 또는 수정 요청 상태에서 다시 시도해 주세요.", 90, t);
            changed = true;
            continue;
          }
          content.segments = segmentsFromAnalysis(job, result);
          content.analysis = { provider: result.provider, model: result.model, analyzedAt: iso(t), summary: result.summary };
          content.aiGenerated = true;
          if (job.requestNote) content.internalNote = [content.internalNote, `다시 분석 요청 사항: ${job.requestNote}`].filter(Boolean).join("\n");
          content.updatedBy = job.requestedBy;
          content.updatedAt = iso(t);
          content.version += 1;
          audit(WORKER_ACTOR, "CONTENT_REANALYZED", "CONTENT", content.id, `다시 분석 반영: 구간 ${content.segments.length}개로 교체`);
        } else {
          const draft = draftFromAnalysis(job, result, iso(t));
          state.contents.push(draft);
          job.contentId = draft.id;
          audit(WORKER_ACTOR, "CONTENT_CREATED", "CONTENT", draft.id, `AI 초안 생성 완료: ${draft.title} (구간 ${draft.segments.length}개)`);
        }
        job.status = "COMPLETED";
        job.progress = 100;
        job.completedAt = iso(t);
        job.updatedAt = iso(t);
        changed = true;
        continue;
      }
      const next = JOB_STAGES[stageIndex]!;
      const progress = Math.round((stageIndex / JOB_STAGES.length) * 100);
      if (job.status !== next || job.progress !== progress) {
        job.status = next;
        job.progress = progress;
        job.updatedAt = iso(t);
        changed = true;
      }
    }

    const remaining = [];
    for (const req of state.ttsRequests) {
      if (t - req.requestedAtMs < ttsMs) {
        remaining.push(req);
        continue;
      }
      const content = state.contents.find((c) => c.id === req.contentId);
      const seg = content?.segments.find((s) => s.id === req.segmentId);
      if (seg && seg.tts.status === "GENERATING") {
        seg.tts = { status: "READY", audioUrl: `mock://tts/${req.segmentId}/${t}`, generatedForText: req.text, failureReason: null };
        changed = true;
      }
    }
    if (remaining.length !== state.ttsRequests.length) {
      state.ttsRequests = remaining;
      changed = true;
    }

    if (changed) persist();
  }

  function newJob(user: AdminUser, fields: Pick<MockJob, "kind" | "title" | "category" | "difficulty" | "requestNote" | "video" | "contentId">): MockJob {
    const t = now();
    return {
      id: newId("j"),
      ...fields,
      status: "QUEUED",
      progress: 0,
      failureReason: null,
      requestedBy: user.id,
      createdAt: iso(t),
      updatedAt: iso(t),
      completedAt: null,
      startedAtMs: t,
      // 파일 이름에 "fail"이 들어가면 실패를 시연한다.
      simulateFailure: /fail/i.test(fields.video.fileName),
    };
  }

  return {
    uploadVideo: async (file, onProgress) => {
      const user = requireUser();
      requirePermission(user, "job:create");
      if (!file.type.startsWith("video/")) throw new AdminApiError("VALIDATION", "영상 파일만 올릴 수 있습니다.");
      if (file.size > MAX_VIDEO_BYTES) throw new AdminApiError("VALIDATION", "영상은 2GB 이하여야 합니다.");
      const meta = await opts.readVideoMetadata(file);
      if (!(meta.durationSec > 0)) throw new AdminApiError("VALIDATION", "영상 길이를 읽을 수 없습니다.");
      // 업로드 진행률 흉내
      for (let i = 1; i <= 4; i++) {
        if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
        onProgress?.(i / 4);
      }
      const id = newId("v");
      await opts.videoStore.put(id, file);
      const asset: VideoAsset = {
        id,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        durationSec: meta.durationSec,
        width: meta.width,
        height: meta.height,
        // 모의 저장소는 blob URL을 재생 시점에 만들므로 고정 주소가 없다.
        url: null,
        uploadedBy: user.id,
        uploadedAt: iso(),
      };
      state.videos.push(asset);
      persist();
      return clone(asset);
    },

    getVideoPlaybackUrl: async (videoId) => {
      requireUser();
      const v = findVideo(videoId);
      if (v.url) return v.url;
      return opts.videoStore.getPlaybackUrl(videoId);
    },

    deleteVideo: (videoId) =>
      withLatency(async () => {
        const user = requireUser();
        requirePermission(user, "job:create");
        const v = findVideo(videoId);
        const inUse = state.jobs.some((j) => j.video.id === videoId) || state.contents.some((c) => c.video.id === videoId);
        if (inUse) throw new AdminApiError("CONFLICT", "작업이나 콘텐츠에 연결된 영상은 지울 수 없습니다.");
        state.videos = state.videos.filter((x) => x.id !== videoId);
        await opts.videoStore.delete(videoId);
        audit(user, "VIDEO_DELETED", "VIDEO", videoId, `연결되지 않은 영상 삭제: ${v.fileName}`);
        persist();
      }),

    listContents: (filter = {}) =>
      withLatency(async () => {
        const user = requireUser();
        requirePermission(user, "content:read");
        await advanceTime();
        const q = filter.query?.trim().toLowerCase();
        return clone(
          state.contents
            .filter((c) => !filter.status || c.status === filter.status)
            .filter(
              (c) =>
                !q ||
                c.title.toLowerCase().includes(q) ||
                c.summary.toLowerCase().includes(q) ||
                c.video.fileName.toLowerCase().includes(q) ||
                c.tags.some((tag) => tag.toLowerCase().includes(q)),
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        );
      }),

    getContent: (id) =>
      withLatency(async () => {
        const user = requireUser();
        requirePermission(user, "content:read");
        await advanceTime();
        return clone(findContent(id));
      }),

    updateContent: (id, input) =>
      withLatency(() => {
        const user = requireUser();
        const content = findContent(id);
        requireEditable(user, content);
        requireVersion(content, input.expectedVersion);
        if (activeReanalysis(id)) throw new AdminApiError("CONFLICT", "다시 분석이 진행 중입니다. 끝난 뒤 수정해 주세요.");
        const { expectedVersion: _v, ...fields } = input;
        const before = new Map(content.segments.map((s) => [s.id, s]));
        const segments = fields.segments.map((s, i) => {
          const prev = before.get(s.id);
          // 음성 파일은 서버가 관리한다. 안내문이 바뀌면 검사 규칙이 재생성 필요를 알려 준다.
          return { ...s, order: i + 1, tts: prev ? prev.tts : { status: "NONE" as const, audioUrl: null, generatedForText: null, failureReason: null } };
        });
        Object.assign(content, fields, {
          segments,
          updatedBy: user.id,
          updatedAt: iso(),
          version: content.version + 1,
        });
        audit(user, "CONTENT_UPDATED", "CONTENT", id, `콘텐츠 수정: ${content.title} (v${content.version}, 구간 ${segments.length}개)`);
        persist();
        return clone(content);
      }),

    replaceContentVideo: (id, input) =>
      withLatency(() => {
        const user = requireUser();
        requirePermission(user, "job:create");
        const content = findContent(id);
        requireEditable(user, content);
        requireVersion(content, input.expectedVersion);
        if (activeReanalysis(id)) throw new AdminApiError("CONFLICT", "다시 분석이 진행 중입니다. 끝난 뒤 영상을 바꿔 주세요.");
        const video = findVideo(input.videoId);
        const before = content.video;
        content.video = video;
        content.updatedBy = user.id;
        content.updatedAt = iso();
        content.version += 1;
        audit(
          user,
          "CONTENT_VIDEO_REPLACED",
          "CONTENT",
          id,
          `영상 교체: ${before.fileName} (${Math.round(before.durationSec)}초) → ${video.fileName} (${Math.round(video.durationSec)}초)`,
        );
        persist();
        return clone(content);
      }),

    reanalyzeContent: (id, input) =>
      withLatency(() => {
        const user = requireUser();
        requirePermission(user, "job:create");
        const content = findContent(id);
        requireEditable(user, content);
        requireVersion(content, input.expectedVersion);
        if (activeReanalysis(id)) throw new AdminApiError("CONFLICT", "이미 다시 분석이 진행 중입니다.");
        const job = newJob(user, {
          kind: "REANALYZE",
          title: content.title,
          category: content.category,
          difficulty: content.difficulty,
          requestNote: input.requestNote.trim(),
          video: content.video,
          contentId: id,
        });
        state.jobs.push(job);
        audit(user, "CONTENT_JOB_CREATED", "CONTENT_JOB", job.id, `다시 분석 요청: ${content.title} (${content.video.fileName})`);
        persist();
        return clone(stripMockFields(job));
      }),

    changeContentStatus: (id, input) =>
      withLatency(() => {
        const user = requireUser();
        const content = findContent(id);
        const t = CONTENT_TRANSITIONS[input.action];
        if (!canPerformAction(user.role, content.status, input.action)) {
          throw new AdminApiError(
            "FORBIDDEN",
            `${CONTENT_STATUS_LABELS[content.status]} 상태에서 "${t.label}"을(를) 할 수 없거나 권한이 없습니다.`,
          );
        }
        if (input.action === "SUBMIT_FOR_REVIEW" && activeReanalysis(id)) {
          throw new AdminApiError("CONFLICT", "다시 분석이 진행 중입니다. 끝난 뒤 검수를 요청해 주세요.");
        }
        const selfApproval = selfApprovalBlockedReason(user.id, input.action, content);
        if (selfApproval) throw new AdminApiError("FORBIDDEN", selfApproval);
        if (input.action === "REQUEST_CHANGES" && !input.comment?.trim()) {
          throw new AdminApiError("VALIDATION", "수정 요청에는 검수 의견을 적어야 합니다.");
        }
        const from = content.status;
        content.status = t.to;
        content.updatedBy = user.id;
        content.updatedAt = iso();
        content.version += 1;
        if (input.action === "SUBMIT_FOR_REVIEW") content.submittedBy = user.id;
        if (input.action === "REQUEST_CHANGES") content.reviewComment = input.comment!.trim();
        if (input.action === "PUBLISH") content.publishedAt = iso();
        if (input.action === "UNPUBLISH") content.publishedAt = null;
        const note = input.comment?.trim() ? ` (의견: ${input.comment.trim()})` : "";
        audit(user, "CONTENT_STATUS_CHANGED", "CONTENT", id, `${CONTENT_STATUS_LABELS[from]} → ${CONTENT_STATUS_LABELS[t.to]}${note}`);
        persist();
        return clone(content);
      }),

    requestTts: (contentId, input) =>
      withLatency(() => {
        const user = requireUser();
        requirePermission(user, "tts:request");
        const content = findContent(contentId);
        if (!canEditContent(user.role, content.status)) {
          throw new AdminApiError("FORBIDDEN", "초안 또는 수정 요청 상태에서만 음성을 생성할 수 있습니다.");
        }
        const t = now();
        const targets = content.segments.filter((s) => input.segmentIds.includes(s.id));
        if (targets.length === 0) throw new AdminApiError("VALIDATION", "음성을 생성할 구간을 선택해 주세요.");
        for (const seg of targets) {
          seg.tts = { status: "GENERATING", audioUrl: null, generatedForText: null, failureReason: null };
          state.ttsRequests.push({ contentId, segmentId: seg.id, text: seg.voiceGuide, requestedAtMs: t });
        }
        content.updatedAt = iso(t);
        audit(user, "TTS_REQUESTED", "CONTENT", contentId, `음성 생성 요청: ${targets.map((s) => `${s.order}구간`).join(", ")}`);
        persist();
        return clone(content);
      }),

    listJobs: () =>
      withLatency(async () => {
        const user = requireUser();
        requirePermission(user, "job:read");
        await advanceTime();
        return clone(state.jobs.map(stripMockFields).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }),

    createJob: (input) =>
      withLatency(() => {
        const user = requireUser();
        requirePermission(user, "job:create");
        if (!input.title.trim()) throw new AdminApiError("VALIDATION", "운동 이름을 입력해 주세요.");
        const video = findVideo(input.videoId);
        const job = newJob(user, {
          kind: "CREATE",
          title: input.title.trim(),
          category: input.category,
          difficulty: input.difficulty,
          requestNote: input.requestNote.trim(),
          video,
          contentId: null,
        });
        state.jobs.push(job);
        audit(user, "CONTENT_JOB_CREATED", "CONTENT_JOB", job.id, `제작 작업 생성: ${job.title} (${video.fileName}, ${Math.round(video.durationSec)}초)`);
        persist();
        return clone(stripMockFields(job));
      }),

    retryJob: (id) =>
      withLatency(() => {
        const user = requireUser();
        requirePermission(user, "job:create");
        const job = findJob(id);
        if (job.status !== "FAILED") throw new AdminApiError("VALIDATION", "실패한 작업만 다시 시도할 수 있습니다.");
        if (job.kind === "REANALYZE" && job.contentId && activeReanalysis(job.contentId)) {
          throw new AdminApiError("CONFLICT", "이 콘텐츠는 이미 다시 분석이 진행 중입니다.");
        }
        const t = now();
        job.status = "QUEUED";
        job.progress = 0;
        job.failureReason = null;
        job.startedAtMs = t;
        job.simulateFailure = false;
        job.updatedAt = iso(t);
        audit(user, "CONTENT_JOB_RETRIED", "CONTENT_JOB", id, `제작 작업 재시도: ${job.title}`);
        persist();
        return clone(stripMockFields(job));
      }),

    listAuditLogs: (filter = {}) =>
      withLatency(() => {
        const user = requireUser();
        requirePermission(user, "audit:read");
        return clone(
          state.auditLogs
            .filter((l) => !filter.targetId || l.targetId === filter.targetId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      }),
  };
}

function stripMockFields(job: MockJob): ContentJob {
  const { startedAtMs: _s, simulateFailure: _f, ...rest } = job;
  return rest;
}
