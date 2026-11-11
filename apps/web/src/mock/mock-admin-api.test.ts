import { describe, expect, it } from "vitest";
import type { AdminUser, ExerciseContent } from "@yconic/shared-types";
import { AdminApiError } from "@/admin/lib/api/admin-api";
import { createMockAdminApi } from "./mock-admin-api";
import { planSegmentsByDuration } from "./mock-analyzer";
import { MOCK_USERS } from "./seed";
import { createMemoryMockStorage } from "./storage";
import { createMemoryVideoStore } from "./video-store";

const editor = MOCK_USERS.find((u) => u.role === "EDITOR")!;
const approver = MOCK_USERS.find((u) => u.role === "APPROVER")!;
const viewer = MOCK_USERS.find((u) => u.role === "VIEWER")!;
const superAdmin = MOCK_USERS.find((u) => u.role === "SUPER_ADMIN")!;

function fakeVideo(name: string, durationSec = 95): File & { durationSec: number } {
  const f = new File([new Uint8Array(16)], name, { type: "video/mp4" }) as File & { durationSec: number };
  f.durationSec = durationSec;
  return f;
}

function setup() {
  let user: AdminUser | null = editor;
  let clock = 1_800_000_000_000;
  const api = createMockAdminApi({
    storage: createMemoryMockStorage(),
    videoStore: createMemoryVideoStore(),
    readVideoMetadata: async (file) => ({ durationSec: (file as File & { durationSec?: number }).durationSec ?? 60, width: 1280, height: 720 }),
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

function editable(c: ExerciseContent) {
  const { title, summary, category, difficulty, tags, precautions, segments, internalNote } = c;
  return { title, summary, category, difficulty, tags, precautions, segments, internalNote };
}

describe("권한 검사", () => {
  it("로그인하지 않으면 거절한다", async () => {
    const { api, as } = setup();
    as(null);
    await expectError(api.listContents(), "UNAUTHORIZED");
  });
  it("조회자는 영상을 올리거나 작업을 만들 수 없다", async () => {
    const { api, as } = setup();
    as(viewer);
    await expectError(api.uploadVideo(fakeVideo("a.mp4")), "FORBIDDEN");
    await expectError(api.createJob({ videoId: "v-neck", title: "x", category: "CARDIO", difficulty: "BEGINNER", requestNote: "" }), "FORBIDDEN");
  });
  it("감사 로그는 최고 관리자만 본다", async () => {
    const { api, as } = setup();
    as(approver);
    await expectError(api.listAuditLogs(), "FORBIDDEN");
    as(superAdmin);
    expect((await api.listAuditLogs()).length).toBeGreaterThan(0);
  });
});

describe("영상 업로드", () => {
  it("영상이 아닌 파일은 거절한다", async () => {
    const { api } = setup();
    const txt = new File(["x"], "a.txt", { type: "text/plain" });
    await expectError(api.uploadVideo(txt), "VALIDATION");
  });
  it("올린 영상의 길이·해상도를 기록하고 재생 주소를 준다", async () => {
    const { api } = setup();
    const progress: number[] = [];
    const v = await api.uploadVideo(fakeVideo("squat.mp4", 123), (p) => progress.push(p));
    expect(v.durationSec).toBe(123);
    expect(v.width).toBe(1280);
    expect(progress.at(-1)).toBe(1);
    expect(await api.getVideoPlaybackUrl(v.id)).toContain(v.id);
  });
  it("예시 영상은 파일이 없어 재생 주소가 null이다", async () => {
    const { api } = setup();
    expect(await api.getVideoPlaybackUrl("v-neck")).toBeNull();
  });
});

describe("검수 흐름", () => {
  it("편집자는 승인할 수 없고 승인권자는 승인한 뒤 공개할 수 있다", async () => {
    const { api, as } = setup();
    await expectError(api.changeContentStatus("c2", { action: "APPROVE" }), "FORBIDDEN");
    as(approver);
    expect((await api.changeContentStatus("c2", { action: "APPROVE" })).status).toBe("APPROVED");
    const published = await api.changeContentStatus("c2", { action: "PUBLISH" });
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).not.toBeNull();
  });
  it("만든 사람은 자기 콘텐츠를 승인할 수 없고, 다른 승인권자는 할 수 있다", async () => {
    const { api, as, tick } = setup();
    as(approver);
    const v = await api.uploadVideo(fakeVideo("mine.mp4", 60));
    const job = await api.createJob({ videoId: v.id, title: "내 운동", category: "CARDIO", difficulty: "BEGINNER", requestNote: "" });
    tick(6000);
    const contentId = (await api.listJobs()).find((j) => j.id === job.id)!.contentId!;
    const draft = await api.getContent(contentId);
    expect(draft.createdBy).toBe(approver.id);
    await api.updateContent(contentId, { ...editable(draft), summary: "요약", expectedVersion: draft.version });
    const submitted = await api.changeContentStatus(contentId, { action: "SUBMIT_FOR_REVIEW" });
    expect(submitted.submittedBy).toBe(approver.id);
    await expect(api.changeContentStatus(contentId, { action: "APPROVE" })).rejects.toThrow("다른 승인권자");
    as(superAdmin);
    expect((await api.changeContentStatus(contentId, { action: "APPROVE" })).status).toBe("APPROVED");
  });
  it("남이 만든 콘텐츠라도 직접 검수를 요청했으면 승인할 수 없다", async () => {
    const { api, as } = setup();
    as(approver);
    // c3는 편집자가 만든 초안이다. 승인권자가 직접 검수를 요청한다.
    await api.changeContentStatus("c3", { action: "SUBMIT_FOR_REVIEW" });
    const c = await api.getContent("c3");
    expect(c.status).toBe("IN_REVIEW");
    expect(c.submittedBy).toBe(approver.id);
    await expectError(api.changeContentStatus("c3", { action: "APPROVE" }), "FORBIDDEN");
    // 수정 요청은 막지 않는다
    expect((await api.changeContentStatus("c3", { action: "REQUEST_CHANGES", comment: "다시 볼게요" })).status).toBe("CHANGES_REQUESTED");
  });
  it("수정 요청에는 의견이 필요하고 콘텐츠에 남는다", async () => {
    const { api, as } = setup();
    as(approver);
    await expectError(api.changeContentStatus("c2", { action: "REQUEST_CHANGES" }), "VALIDATION");
    const c = await api.changeContentStatus("c2", { action: "REQUEST_CHANGES", comment: "2구간 설명 보강" });
    expect(c.status).toBe("CHANGES_REQUESTED");
    expect(c.reviewComment).toBe("2구간 설명 보강");
  });
  it("검수 중인 콘텐츠는 수정할 수 없다", async () => {
    const { api } = setup();
    const c = await api.getContent("c2");
    await expectError(api.updateContent("c2", { ...editable(c), expectedVersion: c.version }), "FORBIDDEN");
  });
  it("버전이 다르면 충돌로 거절하고, 구간 시각 수정은 저장된다", async () => {
    const { api } = setup();
    const c = await api.getContent("c3");
    await expectError(api.updateContent("c3", { ...editable(c), expectedVersion: c.version - 1 }), "CONFLICT");
    const segments = c.segments.map((s, i) => (i === 1 ? { ...s, startSec: 12, endSec: 50 } : s));
    const updated = await api.updateContent("c3", { ...editable(c), segments, expectedVersion: c.version });
    expect(updated.segments[1]?.startSec).toBe(12);
    expect(updated.version).toBe(c.version + 1);
  });
  it("상태 변경은 감사 로그에 남는다", async () => {
    const { api, as } = setup();
    as(approver);
    await api.changeContentStatus("c2", { action: "APPROVE" });
    as(superAdmin);
    const logs = await api.listAuditLogs({ targetId: "c2" });
    expect(logs[0]?.summary).toBe("검수 중 → 승인됨");
  });
});

describe("제작 작업", () => {
  it("올린 영상으로 작업을 만들면 단계를 거쳐 영상 길이에 맞는 구간 초안이 된다", async () => {
    const { api, tick } = setup();
    const v = await api.uploadVideo(fakeVideo("balance.mp4", 100));
    const job = await api.createJob({ videoId: v.id, title: "새 운동", category: "BALANCE", difficulty: "INTERMEDIATE", requestNote: "천천히" });
    expect(job.status).toBe("QUEUED");
    expect(job.video.id).toBe(v.id);
    tick(2500);
    expect((await api.listJobs()).find((j) => j.id === job.id)?.status).toBe("EXTRACTING_STEPS");
    tick(3000);
    const done = (await api.listJobs()).find((j) => j.id === job.id)!;
    expect(done.status).toBe("COMPLETED");
    const draft = await api.getContent(done.contentId!);
    expect(draft.status).toBe("DRAFT");
    expect(draft.aiGenerated).toBe(true);
    expect(draft.analysis?.provider).toBe("mock");
    expect(draft.video.durationSec).toBe(100);
    expect(draft.segments[0]?.kind).toBe("INTRO");
    expect(draft.segments.at(-1)?.endSec).toBe(100);
    expect(draft.internalNote).toContain("천천히");
    // 요약은 사용자에게 읽어 주는 칸이라 분석기 문구를 넣지 않는다
    expect(draft.summary).toBe("");
    expect(draft.analysis?.summary).toContain("모의 분석");
    expect(job.kind).toBe("CREATE");
  });
  it("없는 영상으로는 작업을 만들 수 없다", async () => {
    const { api } = setup();
    await expectError(api.createJob({ videoId: "nope", title: "x", category: "CARDIO", difficulty: "BEGINNER", requestNote: "" }), "NOT_FOUND");
  });
  it("파일 이름에 fail이 있으면 실패하고 다시 시도할 수 있다", async () => {
    const { api, tick } = setup();
    const v = await api.uploadVideo(fakeVideo("fail-video.mp4"));
    const job = await api.createJob({ videoId: v.id, title: "실패 운동", category: "REHAB", difficulty: "BEGINNER", requestNote: "" });
    tick(1500);
    expect((await api.listJobs()).find((j) => j.id === job.id)?.status).toBe("FAILED");
    expect((await api.retryJob(job.id)).status).toBe("QUEUED");
    tick(6000);
    expect((await api.listJobs()).find((j) => j.id === job.id)?.status).toBe("COMPLETED");
  });
});

describe("모의 분석기 구간 나누기", () => {
  it("구간이 이어지고 영상 길이 안에 있다", () => {
    for (const d of [10, 25, 60, 180, 600]) {
      const segs = planSegmentsByDuration(d, "STRENGTH");
      expect(segs[0]?.startSec).toBe(0);
      expect(segs.at(-1)?.endSec).toBe(d);
      for (let i = 1; i < segs.length; i++) expect(segs[i]!.startSec).toBeCloseTo(segs[i - 1]!.endSec, 5);
      for (const s of segs) expect(s.endSec).toBeGreaterThan(s.startSec);
    }
  });
  it("짧은 영상은 운동 구간 하나만 만든다", () => {
    expect(planSegmentsByDuration(12, "CARDIO").map((s) => s.kind)).toEqual(["EXERCISE"]);
  });
});

describe("영상 삭제", () => {
  it("연결되지 않은 영상은 지울 수 있고, 지운 뒤에는 재생 주소가 없다", async () => {
    const { api } = setup();
    const v = await api.uploadVideo(fakeVideo("orphan.mp4"));
    await api.deleteVideo(v.id);
    await expectError(api.getVideoPlaybackUrl(v.id), "NOT_FOUND");
  });
  it("작업이나 콘텐츠에 연결된 영상은 지울 수 없다", async () => {
    const { api } = setup();
    await expectError(api.deleteVideo("v-neck"), "CONFLICT");
    const v = await api.uploadVideo(fakeVideo("used.mp4"));
    await api.createJob({ videoId: v.id, title: "x", category: "CARDIO", difficulty: "BEGINNER", requestNote: "" });
    await expectError(api.deleteVideo(v.id), "CONFLICT");
  });
});

describe("영상 교체", () => {
  it("초안의 영상을 바꾸면 구간은 그대로 두고 버전이 오른다", async () => {
    const { api } = setup();
    const before = await api.getContent("c3");
    const v = await api.uploadVideo(fakeVideo("wall-v2.mp4", 60));
    const after = await api.replaceContentVideo("c3", { videoId: v.id, expectedVersion: before.version });
    expect(after.video.id).toBe(v.id);
    expect(after.segments.map((s) => s.id)).toEqual(before.segments.map((s) => s.id));
    expect(after.version).toBe(before.version + 1);
  });
  it("검수 중인 콘텐츠의 영상은 바꿀 수 없다", async () => {
    const { api } = setup();
    const c = await api.getContent("c2");
    const v = await api.uploadVideo(fakeVideo("x.mp4"));
    await expectError(api.replaceContentVideo("c2", { videoId: v.id, expectedVersion: c.version }), "FORBIDDEN");
  });
});

describe("다시 분석", () => {
  it("끝나면 구간이 새 분석 결과로 바뀌고 요약은 그대로다", async () => {
    const { api, tick, as } = setup();
    const before = await api.getContent("c3");
    const job = await api.reanalyzeContent("c3", { requestNote: "휴식 넉넉히", expectedVersion: before.version });
    expect(job.kind).toBe("REANALYZE");
    expect(job.contentId).toBe("c3");
    await expectError(api.reanalyzeContent("c3", { requestNote: "", expectedVersion: before.version }), "CONFLICT");
    await expectError(api.updateContent("c3", { ...editable(before), expectedVersion: before.version }), "CONFLICT");
    tick(6000);
    const after = await api.getContent("c3");
    expect(after.segments.map((s) => s.id)).not.toEqual(before.segments.map((s) => s.id));
    expect(after.segments.every((s) => s.tts.status === "READY")).toBe(true);
    expect(after.summary).toBe(before.summary);
    expect(after.internalNote).toContain("휴식 넉넉히");
    expect(after.version).toBe(before.version + 1);
    as(superAdmin);
    expect((await api.listAuditLogs({ targetId: "c3" }))[0]?.action).toBe("CONTENT_REANALYZED");
  });
  it("진행 중에는 검수 요청을 막는다", async () => {
    const { api } = setup();
    const c = await api.getContent("c4");
    await api.reanalyzeContent("c4", { requestNote: "", expectedVersion: c.version });
    await expectError(api.changeContentStatus("c4", { action: "SUBMIT_FOR_REVIEW" }), "CONFLICT");
  });
  it("그 사이 콘텐츠가 수정할 수 없는 상태가 되면 결과를 반영하지 않고 실패한다", async () => {
    const { api, tick } = setup();
    const before = await api.getContent("c3");
    const job = await api.reanalyzeContent("c3", { requestNote: "", expectedVersion: before.version });
    await api.changeContentStatus("c3", { action: "ARCHIVE" });
    tick(6000);
    const done = (await api.listJobs()).find((j) => j.id === job.id)!;
    expect(done.status).toBe("FAILED");
    expect(done.failureReason).toContain("반영하지 못했습니다");
    const after = await api.getContent("c3");
    expect(after.segments.map((s) => s.id)).toEqual(before.segments.map((s) => s.id));
  });
  it("검수 중인 콘텐츠는 다시 분석할 수 없다", async () => {
    const { api } = setup();
    const c = await api.getContent("c2");
    await expectError(api.reanalyzeContent("c2", { requestNote: "", expectedVersion: c.version }), "FORBIDDEN");
  });
});

describe("저장 데이터 옮기기", () => {
  it("예전 형식(v2) 데이터를 v4로 옮긴다", async () => {
    const { migrateMockState } = await import("./storage");
    const migrated = migrateMockState({ schemaVersion: 2, jobs: [{ id: "j1" }], videos: [], contents: [{ id: "c1" }], auditLogs: [], ttsRequests: [] });
    expect(migrated?.schemaVersion).toBe(4);
    expect(migrated?.jobs[0]?.kind).toBe("CREATE");
    expect(migrated?.contents[0]?.submittedBy).toBeNull();
    expect(migrateMockState({ schemaVersion: 1 })).toBeNull();
  });
});

describe("음성 생성", () => {
  it("요청한 구간만 생성 중이 되고 시간이 지나면 완료된다", async () => {
    const { api, tick } = setup();
    const c = await api.requestTts("c3", { segmentIds: ["c3-s2"] });
    expect(c.segments[0]?.tts.status).toBe("NONE");
    expect(c.segments[1]?.tts.status).toBe("GENERATING");
    tick(1500);
    const after = await api.getContent("c3");
    expect(after.segments[1]?.tts.status).toBe("READY");
    expect(after.segments[1]?.tts.generatedForText).toBe(after.segments[1]?.voiceGuide);
  });
});
