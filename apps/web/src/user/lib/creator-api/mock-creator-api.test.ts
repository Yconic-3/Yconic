import { describe, expect, it } from "vitest";
import type { AdminUser } from "@yconic/shared-types";
import type { SignedInAccount } from "@/lib/auth";
import { createMockAdminApi } from "@/mock/mock-admin-api";
import { createMemoryMockStorage } from "@/mock/storage";
import { createMemoryVideoStore } from "@/mock/video-store";
import { CreatorApiError } from "./creator-api";
import { createMockCreatorApi } from "./mock-creator-api";

const member: SignedInAccount = { id: "u-member", name: "체험 회원", email: "member@example.com", adminRole: null };
const other: SignedInAccount = { id: "u-other", name: "다른 회원", email: "other@example.com", adminRole: null };

function setup() {
  let account: SignedInAccount | null = member;
  let clock = 1_800_000_000_000;
  const backend = createMockAdminApi({
    storage: createMemoryMockStorage(),
    videoStore: createMemoryVideoStore(),
    readVideoMetadata: async () => ({ durationSec: 60, width: 1280, height: 720 }),
    getCurrentUser: (): AdminUser | null => (account ? { id: account.id, name: account.name, email: account.email, role: "EDITOR" } : null),
    now: () => clock,
    latencyMs: 0,
    jobStageMs: 1000,
    ttsMs: 1000,
  });
  const api = createMockCreatorApi(backend, () => account);
  return {
    api,
    as(a: SignedInAccount | null) {
      account = a;
    },
    tick(ms: number) {
      clock += ms;
    },
  };
}

async function draftOf(s: ReturnType<typeof setup>) {
  const video = await s.api.uploadVideo(new File([new Uint8Array(16)], "레그 레이즈.mp4", { type: "video/mp4" }));
  const job = await s.api.createJob({ videoId: video.id, title: "레그 레이즈", category: "STRENGTH", difficulty: "BEGINNER", requestNote: "" });
  s.tick(60_000);
  const done = await s.api.getJob(job.id);
  expect(done.status).toBe("COMPLETED");
  return s.api.getMyContent(done.contentId!);
}

describe("모의 회원 콘텐츠 올리기", () => {
  it("로그인하지 않으면 거절한다", async () => {
    const s = setup();
    s.as(null);
    await expect(s.api.listMyContents()).rejects.toSatisfy((e) => e instanceof CreatorApiError && e.code === "UNAUTHORIZED");
  });

  it("올린 영상으로 초안이 생기고, 내 것만 보이며 운영자 메모는 빠진다", async () => {
    const s = setup();
    const draft = await draftOf(s);
    expect(draft.status).toBe("DRAFT");
    expect("internalNote" in draft).toBe(false);
    expect(draft.analysis?.findings?.length).toBeGreaterThan(0);
    expect((await s.api.listMyContents()).map((c) => c.id)).toEqual([draft.id]);
    s.as(other);
    expect(await s.api.listMyContents()).toEqual([]);
    await expect(s.api.getMyContent(draft.id)).rejects.toSatisfy((e) => e instanceof CreatorApiError && e.code === "NOT_FOUND");
  });

  it("안내를 고치고, 시각 의존 표현이 있으면 막고, 확인하면 검수를 요청한다", async () => {
    const s = setup();
    const draft = await draftOf(s);
    const seg = draft.segments[0]!;
    const visual = await s.api.updateMyGuides(draft.id, { expectedVersion: draft.version, segments: [{ id: seg.id, voiceGuide: "여기에 손을 둡니다." }] });
    await expect(s.api.submitMyContent(draft.id, { expectedVersion: visual.version, confirmed: true })).rejects.toThrow(/1단계/);
    const fixed = await s.api.updateMyGuides(draft.id, { expectedVersion: visual.version, segments: [{ id: seg.id, voiceGuide: "의자 등받이에 두 손을 둡니다." }] });
    await expect(s.api.submitMyContent(draft.id, { expectedVersion: fixed.version, confirmed: false })).rejects.toThrow(/확인/);
    const sent = await s.api.submitMyContent(draft.id, { expectedVersion: fixed.version, confirmed: true });
    expect(sent.status).toBe("IN_REVIEW");
    await expect(s.api.updateMyGuides(draft.id, { expectedVersion: sent.version, segments: [] })).rejects.toSatisfy(
      (e) => e instanceof CreatorApiError && e.code === "FORBIDDEN",
    );
  });
});
