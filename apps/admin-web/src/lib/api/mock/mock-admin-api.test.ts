import { describe, expect, it } from "vitest";
import type { AdminUser } from "@yconic/shared-types";
import { AdminApiError } from "../admin-api";
import { createMockAdminApi } from "./mock-admin-api";
import { MOCK_USERS } from "./seed";
import { createMemoryMockStorage } from "./storage";

const editor = MOCK_USERS.find((u) => u.role === "EDITOR")!;
const approver = MOCK_USERS.find((u) => u.role === "APPROVER")!;
const viewer = MOCK_USERS.find((u) => u.role === "VIEWER")!;
const superAdmin = MOCK_USERS.find((u) => u.role === "SUPER_ADMIN")!;

function setup() {
  let user: AdminUser | null = editor;
  let clock = 1_800_000_000_000;
  const api = createMockAdminApi({
    storage: createMemoryMockStorage(),
    getCurrentUser: () => user,
    now: () => clock,
    latencyMs: 0,
    jobStageMs: 1000,
    ttsMs: 1000,
  });
  return {
    api,
    as(u: AdminUser | null) {
      user = u;
    },
    tick(ms: number) {
      clock += ms;
    },
  };
}

async function expectError(p: Promise<unknown>, code: AdminApiError["code"]) {
  await expect(p).rejects.toSatisfy((e) => e instanceof AdminApiError && e.code === code);
}

describe("권한 검사", () => {
  it("로그인하지 않으면 거절한다", async () => {
    const { api, as } = setup();
    as(null);
    await expectError(api.listContents(), "UNAUTHORIZED");
  });
  it("조회자는 작업을 만들 수 없다", async () => {
    const { api, as } = setup();
    as(viewer);
    await expectError(
      api.createJob({ title: "x", category: "CARDIO", difficulty: "BEGINNER", requestNote: "", sourceVideo: { fileName: "a.mp4", sizeBytes: 1, url: null } }),
      "FORBIDDEN",
    );
  });
  it("감사 로그는 최고 관리자만 본다", async () => {
    const { api, as } = setup();
    as(approver);
    await expectError(api.listAuditLogs(), "FORBIDDEN");
    as(superAdmin);
    expect((await api.listAuditLogs()).length).toBeGreaterThan(0);
  });
});

describe("검수 흐름", () => {
  it("편집자는 승인할 수 없고 승인권자는 승인한 뒤 공개할 수 있다", async () => {
    const { api, as } = setup();
    await expectError(api.changeContentStatus("c2", { action: "APPROVE" }), "FORBIDDEN");
    as(approver);
    const approved = await api.changeContentStatus("c2", { action: "APPROVE" });
    expect(approved.status).toBe("APPROVED");
    const published = await api.changeContentStatus("c2", { action: "PUBLISH" });
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).not.toBeNull();
  });
  it("수정 요청에는 의견이 필요하고 콘텐츠에 남는다", async () => {
    const { api, as } = setup();
    as(approver);
    await expectError(api.changeContentStatus("c2", { action: "REQUEST_CHANGES" }), "VALIDATION");
    const c = await api.changeContentStatus("c2", { action: "REQUEST_CHANGES", comment: "2단계 설명 보강" });
    expect(c.status).toBe("CHANGES_REQUESTED");
    expect(c.reviewComment).toBe("2단계 설명 보강");
  });
  it("검수 중인 콘텐츠는 수정할 수 없다", async () => {
    const { api } = setup();
    const c = await api.getContent("c2");
    await expectError(api.updateContent("c2", { ...pick(c), expectedVersion: c.version }), "FORBIDDEN");
  });
  it("버전이 다르면 충돌로 거절한다", async () => {
    const { api } = setup();
    const c = await api.getContent("c3");
    await expectError(api.updateContent("c3", { ...pick(c), expectedVersion: c.version - 1 }), "CONFLICT");
    const updated = await api.updateContent("c3", { ...pick(c), title: "새 제목", expectedVersion: c.version });
    expect(updated.title).toBe("새 제목");
    expect(updated.version).toBe(c.version + 1);
  });
  it("상태 변경은 감사 로그에 남는다", async () => {
    const { api, as } = setup();
    as(approver);
    await api.changeContentStatus("c2", { action: "APPROVE" });
    as(superAdmin);
    const logs = await api.listAuditLogs({ targetId: "c2" });
    expect(logs[0]?.summary).toBe("검수 중 → 승인됨");
    expect(logs[0]?.actorRole).toBe("APPROVER");
  });
});

describe("제작 작업", () => {
  it("작업은 시간이 지나면 단계를 거쳐 초안이 된다", async () => {
    const { api, tick } = setup();
    const job = await api.createJob({
      title: "새 운동",
      category: "BALANCE",
      difficulty: "INTERMEDIATE",
      requestNote: "천천히",
      sourceVideo: { fileName: "balance.mp4", sizeBytes: 10, url: null },
    });
    expect(job.status).toBe("QUEUED");
    tick(2500);
    let jobs = await api.listJobs();
    expect(jobs.find((j) => j.id === job.id)?.status).toBe("EXTRACTING_STEPS");
    tick(3000);
    jobs = await api.listJobs();
    const done = jobs.find((j) => j.id === job.id)!;
    expect(done.status).toBe("COMPLETED");
    expect(done.contentId).not.toBeNull();
    const draft = await api.getContent(done.contentId!);
    expect(draft.status).toBe("DRAFT");
    expect(draft.aiGenerated).toBe(true);
    expect(draft.steps.length).toBeGreaterThan(0);
    expect(draft.internalNote).toContain("천천히");
  });
  it("파일 이름에 fail이 있으면 실패하고 다시 시도할 수 있다", async () => {
    const { api, tick } = setup();
    const job = await api.createJob({
      title: "실패 운동",
      category: "REHAB",
      difficulty: "BEGINNER",
      requestNote: "",
      sourceVideo: { fileName: "fail-video.mp4", sizeBytes: 10, url: null },
    });
    tick(1500);
    expect((await api.listJobs()).find((j) => j.id === job.id)?.status).toBe("FAILED");
    const retried = await api.retryJob(job.id);
    expect(retried.status).toBe("QUEUED");
    tick(6000);
    expect((await api.listJobs()).find((j) => j.id === job.id)?.status).toBe("COMPLETED");
  });
});

describe("음성 생성", () => {
  it("요청한 단계만 생성 중이 되고 시간이 지나면 완료된다", async () => {
    const { api, tick } = setup();
    const c = await api.requestTts("c3", { stepIds: ["c3-s2"] });
    expect(c.steps[0]?.tts.status).toBe("NONE");
    expect(c.steps[1]?.tts.status).toBe("GENERATING");
    tick(1500);
    const after = await api.getContent("c3");
    expect(after.steps[1]?.tts.status).toBe("READY");
    expect(after.steps[1]?.tts.generatedForText).toBe(after.steps[1]?.voiceGuide);
  });
});

function pick(c: Awaited<ReturnType<ReturnType<typeof setup>["api"]["getContent"]>>) {
  const { title, summary, category, difficulty, tags, precautions, steps, internalNote } = c;
  return { title, summary, category, difficulty, tags, precautions, steps, internalNote };
}
