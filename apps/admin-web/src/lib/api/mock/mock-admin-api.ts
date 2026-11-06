import {
  AUDIT_ACTION_LABELS,
  CONTENT_STATUS_LABELS,
  CONTENT_TRANSITIONS,
  canEditContent,
  canPerformAction,
  hasPermission,
  type AdminUser,
  type AuditAction,
  type AuditLog,
  type ContentJob,
  type ContentJobStatus,
  type ExerciseContent,
  type ISODateString,
} from "@yconic/shared-types";
import { AdminApiError, type AdminApi } from "../admin-api";
import { generateDraftFromJob } from "./draft-generator";
import { createSeedState, type MockJob, type MockState } from "./seed";

export interface MockStorage {
  load(): MockState | null;
  save(state: MockState): void;
}

export interface MockAdminApiOptions {
  storage: MockStorage;
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

  let state: MockState = opts.storage.load() ?? createSeedState(now());
  let seq = 0;
  const newId = (prefix: string) => `${prefix}-${now().toString(36)}-${(seq++).toString(36)}`;
  const iso = (ms = now()): ISODateString => new Date(ms).toISOString();
  const clone = <T>(v: T): T => structuredClone(v);

  function persist() {
    opts.storage.save(state);
  }

  async function withLatency<T>(fn: () => T): Promise<T> {
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

  function audit(user: AdminUser, action: AuditAction, targetType: AuditLog["targetType"], targetId: string, summary: string) {
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

  /** 시간이 흐른 만큼 진행 중인 작업과 TTS 요청을 앞으로 보낸다. 조회할 때마다 호출한다. */
  function advanceTime() {
    const t = now();
    let changed = false;

    for (const job of state.jobs) {
      if (job.status === "COMPLETED" || job.status === "FAILED") continue;
      const stageIndex = Math.floor((t - job.startedAtMs) / jobStageMs);
      if (job.simulateFailure && stageIndex >= 1) {
        job.status = "FAILED";
        job.progress = 20;
        job.failureReason = "영상에서 사람의 동작을 인식하지 못했습니다. 전신이 밝게 나오는 영상인지 확인해 주세요.";
        job.updatedAt = iso(t);
        changed = true;
        continue;
      }
      if (stageIndex >= JOB_STAGES.length) {
        const draft = generateDraftFromJob(job, { content: newId("c"), step: () => newId("s") }, iso(t));
        state.contents.push(draft);
        job.status = "COMPLETED";
        job.progress = 100;
        job.contentId = draft.id;
        job.completedAt = iso(t);
        job.updatedAt = iso(t);
        const requester = { id: job.requestedBy, name: "content-worker", role: "EDITOR" as const, email: "" };
        audit(requester, "CONTENT_CREATED", "CONTENT", draft.id, `AI 초안 생성 완료: ${draft.title}`);
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
      const step = content?.steps.find((s) => s.id === req.stepId);
      if (step && step.tts.status === "GENERATING") {
        step.tts = { status: "READY", audioUrl: `mock://tts/${req.stepId}/${t}`, generatedForText: req.text, failureReason: null };
        changed = true;
      }
    }
    if (remaining.length !== state.ttsRequests.length) {
      state.ttsRequests = remaining;
      changed = true;
    }

    if (changed) persist();
  }

  return {
    listContents: (filter = {}) =>
      withLatency(() => {
        const user = requireUser();
        requirePermission(user, "content:read");
        advanceTime();
        const q = filter.query?.trim().toLowerCase();
        return clone(
          state.contents
            .filter((c) => !filter.status || c.status === filter.status)
            .filter(
              (c) =>
                !q ||
                c.title.toLowerCase().includes(q) ||
                c.summary.toLowerCase().includes(q) ||
                c.tags.some((tag) => tag.toLowerCase().includes(q)),
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        );
      }),

    getContent: (id) =>
      withLatency(() => {
        const user = requireUser();
        requirePermission(user, "content:read");
        advanceTime();
        return clone(findContent(id));
      }),

    updateContent: (id, input) =>
      withLatency(() => {
        const user = requireUser();
        const content = findContent(id);
        if (!canEditContent(user.role, content.status)) {
          throw new AdminApiError(
            "FORBIDDEN",
            `${CONTENT_STATUS_LABELS[content.status]} 상태의 콘텐츠는 수정할 수 없거나 수정 권한이 없습니다.`,
          );
        }
        if (input.expectedVersion !== content.version) {
          throw new AdminApiError("CONFLICT", "다른 사람이 먼저 수정했습니다. 새로 고친 뒤 다시 시도해 주세요.");
        }
        const { expectedVersion: _v, ...fields } = input;
        const stepsBefore = new Map(content.steps.map((s) => [s.id, s]));
        const steps = fields.steps.map((s, i) => {
          const prev = stepsBefore.get(s.id);
          // 안내문이 바뀌었으면 음성 파일은 그대로 두되, 검사 규칙이 재생성 필요를 알려 준다.
          return { ...s, order: i + 1, tts: prev ? prev.tts : s.tts };
        });
        Object.assign(content, fields, {
          steps,
          updatedBy: user.id,
          updatedAt: iso(),
          version: content.version + 1,
        });
        audit(user, "CONTENT_UPDATED", "CONTENT", id, `콘텐츠 수정: ${content.title} (v${content.version})`);
        persist();
        return clone(content);
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
        if (input.action === "REQUEST_CHANGES" && !input.comment?.trim()) {
          throw new AdminApiError("VALIDATION", "수정 요청에는 검수 의견을 적어야 합니다.");
        }
        const from = content.status;
        content.status = t.to;
        content.updatedBy = user.id;
        content.updatedAt = iso();
        content.version += 1;
        if (input.action === "REQUEST_CHANGES") content.reviewComment = input.comment!.trim();
        if (input.action === "PUBLISH") content.publishedAt = iso();
        if (input.action === "UNPUBLISH") content.publishedAt = null;
        const note = input.comment?.trim() ? ` (의견: ${input.comment.trim()})` : "";
        audit(
          user,
          "CONTENT_STATUS_CHANGED",
          "CONTENT",
          id,
          `${CONTENT_STATUS_LABELS[from]} → ${CONTENT_STATUS_LABELS[t.to]}${note}`,
        );
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
        const targets = content.steps.filter((s) => input.stepIds.includes(s.id));
        if (targets.length === 0) throw new AdminApiError("VALIDATION", "음성을 생성할 단계를 선택해 주세요.");
        for (const step of targets) {
          step.tts = { status: "GENERATING", audioUrl: null, generatedForText: null, failureReason: null };
          state.ttsRequests.push({ contentId, stepId: step.id, text: step.voiceGuide, requestedAtMs: t });
        }
        content.updatedAt = iso(t);
        audit(user, "TTS_REQUESTED", "CONTENT", contentId, `음성 생성 요청: ${targets.map((s) => `${s.order}단계`).join(", ")}`);
        persist();
        return clone(content);
      }),

    listJobs: () =>
      withLatency(() => {
        const user = requireUser();
        requirePermission(user, "job:read");
        advanceTime();
        return clone(state.jobs.map(stripMockFields).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }),

    createJob: (input) =>
      withLatency(() => {
        const user = requireUser();
        requirePermission(user, "job:create");
        if (!input.title.trim()) throw new AdminApiError("VALIDATION", "운동 이름을 입력해 주세요.");
        if (!input.sourceVideo.fileName) throw new AdminApiError("VALIDATION", "운동 영상을 선택해 주세요.");
        const t = now();
        const job: MockJob = {
          id: newId("j"),
          title: input.title.trim(),
          category: input.category,
          difficulty: input.difficulty,
          requestNote: input.requestNote.trim(),
          sourceVideo: input.sourceVideo,
          status: "QUEUED",
          progress: 0,
          failureReason: null,
          contentId: null,
          requestedBy: user.id,
          createdAt: iso(t),
          updatedAt: iso(t),
          completedAt: null,
          startedAtMs: t,
          // 파일 이름에 "fail"이 들어가면 실패를 시연한다.
          simulateFailure: /fail/i.test(input.sourceVideo.fileName),
        };
        state.jobs.push(job);
        audit(user, "CONTENT_JOB_CREATED", "CONTENT_JOB", job.id, `제작 작업 생성: ${job.title} (${job.sourceVideo.fileName})`);
        persist();
        return clone(stripMockFields(job));
      }),

    retryJob: (id) =>
      withLatency(() => {
        const user = requireUser();
        requirePermission(user, "job:create");
        const job = findJob(id);
        if (job.status !== "FAILED") throw new AdminApiError("VALIDATION", "실패한 작업만 다시 시도할 수 있습니다.");
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

export { AUDIT_ACTION_LABELS };
