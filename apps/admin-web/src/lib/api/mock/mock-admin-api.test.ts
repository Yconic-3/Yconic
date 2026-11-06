import { describe, expect, it } from "vitest";
import type { AdminUser, ExerciseContent } from "@yconic/shared-types";
import { AdminApiError } from "../admin-api";
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
    await expectError(api.createJob({ videoId: "v1", title: "x", category: "CARDIO", difficulty: "BEGINNER", requestNote: "" }), "FORBIDDEN");
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
    expect(await api.getVideoPlaybackUrl("v1")).toBeNull();
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
