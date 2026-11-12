import type { AuthAccount, ContentJob, ExerciseContent, LoginResponse, MyContent, PublishedExercise, VideoAsset } from "@yconic/shared-types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { client, login, startTestServer, type TestServer } from "./helpers";

let s: TestServer;
const anon = () => client(s.baseUrl);
const editor = () => login(s.baseUrl, "editor@example.com", "editor1234");
const approver = () => login(s.baseUrl, "approver@example.com", "approver1234");
const superAdmin = () => login(s.baseUrl, "super@example.com", "super1234");

beforeAll(async () => {
  s = await startTestServer();
});
afterAll(async () => {
  await s?.close();
});
beforeEach(async () => {
  await s.reset();
});

function videoForm(name: string, durationSec = 95) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(1024)], { type: "video/mp4" }), name);
  form.append("durationSec", String(durationSec));
  form.append("width", "1280");
  form.append("height", "720");
  return form;
}

describe("로그인", () => {
  it("맞는 비밀번호면 토큰과 계정을 준다", async () => {
    const res = await anon().post<LoginResponse>("/auth/login", { email: "Editor@Example.com ", password: "editor1234" });
    expect(res.status).toBe(200);
    expect(res.body.account).toEqual({ id: "u-editor", name: "김편집", email: "editor@example.com", adminRole: "EDITOR" });
    const me = await client(s.baseUrl, res.body.token).get<AuthAccount>("/auth/me");
    expect(me.body.id).toBe("u-editor");
  });

  it("틀린 비밀번호와 없는 이메일은 401", async () => {
    expect((await anon().post("/auth/login", { email: "editor@example.com", password: "x" })).status).toBe(401);
    const res = await anon().post("/auth/login", { email: "nobody@example.com", password: "x" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("로그아웃하면 토큰을 더 쓸 수 없다", async () => {
    const res = await anon().post<LoginResponse>("/auth/login", { email: "member@example.com", password: "member1234" });
    const me = client(s.baseUrl, res.body.token);
    expect((await me.post("/auth/logout")).status).toBe(204);
    expect((await me.get("/auth/me")).status).toBe(401);
  });
});

describe("사용자 화면 API", () => {
  it("공개 중인 운동만, 사용자에게 보여 줄 칸만 준다", async () => {
    const res = await anon().get<PublishedExercise[]>("/exercises");
    expect(res.status).toBe(200);
    expect(res.body.map((e) => e.id).sort()).toEqual(["c-march", "c-neck", "c-squat", "c-wall"]);
    for (const e of res.body) {
      expect(e).not.toHaveProperty("internalNote");
      expect(e).not.toHaveProperty("createdBy");
      expect(e.segments.length).toBeGreaterThan(0);
    }
  });

  it("분류와 낱말로 거른다", async () => {
    const byCategory = await anon().get<PublishedExercise[]>("/exercises?category=CARDIO");
    expect(byCategory.body.map((e) => e.id)).toEqual(["c-march"]);
    const byKeyword = await anon().get<PublishedExercise[]>(`/exercises?keyword=${encodeURIComponent("목 스트레칭")}`);
    expect(byKeyword.body.map((e) => e.id)).toContain("c-neck");
    expect((await anon().get("/exercises?category=NOPE")).status).toBe(400);
  });

  it("공개 중이 아닌 콘텐츠는 404", async () => {
    expect((await anon().get("/exercises/c-neck")).status).toBe(200);
    expect((await anon().get("/exercises/c2")).status).toBe(404);
  });
});

describe("관리자 API 권한", () => {
  it("로그인하지 않으면 401, 일반 회원은 403", async () => {
    expect((await anon().get("/admin/contents")).status).toBe(401);
    const member = await login(s.baseUrl, "member@example.com", "member1234");
    expect((await member.get("/admin/contents")).status).toBe(403);
  });

  it("조회자는 읽기만 할 수 있다", async () => {
    const viewer = await login(s.baseUrl, "viewer@example.com", "viewer1234");
    expect((await viewer.get("/admin/contents")).status).toBe(200);
    expect((await viewer.post("/admin/content-jobs", { videoId: "x", title: "t", category: "CARDIO", difficulty: "BEGINNER" })).status).toBe(403);
    expect((await viewer.get("/admin/audit-logs")).status).toBe(403);
  });

  it("감사 로그는 최고 관리자만 본다", async () => {
    const res = await (await superAdmin()).get("/admin/audit-logs");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe("콘텐츠 수정과 검수", () => {
  it("목록 검색과 상태 거르기", async () => {
    const ed = await editor();
    const drafts = await ed.get<ExerciseContent[]>("/admin/contents?status=DRAFT");
    expect(drafts.body.map((c) => c.id)).toEqual(["c3"]);
    const found = await ed.get<ExerciseContent[]>(`/admin/contents?query=${encodeURIComponent("종아리")}`);
    expect(found.body.map((c) => c.id)).toContain("c3");
  });

  it("수정하면 버전이 오르고, 옛 버전으로 고치면 409", async () => {
    const ed = await editor();
    const c = (await ed.get<ExerciseContent>("/admin/contents/c3")).body;
    const input = { ...c, title: "벽 짚고 종아리 늘리기", segments: [...c.segments, { ...c.segments[0]!, id: "tmp-1", title: "새 구간" }], expectedVersion: c.version };
    const ok = await ed.patch<ExerciseContent>("/admin/contents/c3", input);
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(c.version + 1);
    expect(ok.body.title).toBe("벽 짚고 종아리 늘리기");
    // 새 구간은 서버가 ID를 새로 주고, 음성은 "미생성"으로 시작한다
    const added = ok.body.segments.at(-1)!;
    expect(added.id).not.toBe("tmp-1");
    expect(added.tts.status).toBe("NONE");
    expect(ok.body.segments.map((x) => x.order)).toEqual(ok.body.segments.map((_, i) => i + 1));

    const stale = await ed.patch("/admin/contents/c3", input);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("CONFLICT");
  });

  it("틀린 모양의 요청은 400", async () => {
    const ed = await editor();
    const res = await ed.patch("/admin/contents/c3", { title: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION");
  });

  it("자기가 검수를 요청한 콘텐츠는 승인할 수 없다", async () => {
    const ap = await approver();
    const submitted = await ap.post<ExerciseContent>("/admin/contents/c3/actions", { action: "SUBMIT_FOR_REVIEW" });
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe("IN_REVIEW");
    expect(submitted.body.submittedBy).toBe("u-approver");

    const self = await ap.post("/admin/contents/c3/actions", { action: "APPROVE" });
    expect(self.status).toBe(403);

    const other = await (await superAdmin()).post<ExerciseContent>("/admin/contents/c3/actions", { action: "APPROVE" });
    expect(other.status).toBe(200);
    expect(other.body.status).toBe("APPROVED");
  });

  it("승인 → 공개하면 사용자 화면에 나온다", async () => {
    const ap = await approver();
    expect((await ap.post("/admin/contents/c2/actions", { action: "APPROVE" })).status).toBe(200);
    const pub = await ap.post<ExerciseContent>("/admin/contents/c2/actions", { action: "PUBLISH" });
    expect(pub.body.status).toBe("PUBLISHED");
    expect(pub.body.publishedAt).not.toBeNull();
    expect((await anon().get("/exercises/c2")).status).toBe(200);
  });

  it("수정 요청에는 의견이 있어야 한다", async () => {
    const ap = await approver();
    expect((await ap.post("/admin/contents/c2/actions", { action: "REQUEST_CHANGES" })).status).toBe(400);
    const res = await ap.post<ExerciseContent>("/admin/contents/c2/actions", { action: "REQUEST_CHANGES", comment: "2구간 안내를 더 짧게" });
    expect(res.body.status).toBe("CHANGES_REQUESTED");
    expect(res.body.reviewComment).toBe("2구간 안내를 더 짧게");
  });

  it("편집자는 승인할 수 없다", async () => {
    expect((await (await editor()).post("/admin/contents/c2/actions", { action: "APPROVE" })).status).toBe(403);
  });
});

describe("음성(TTS) 생성", () => {
  it("요청하면 생성 중이 되고, 작업기가 돌면 준비됨이 된다", async () => {
    const ed = await editor();
    const req = await ed.post<ExerciseContent>("/admin/contents/c3/tts", { segmentIds: ["c3-s2"] });
    expect(req.status).toBe(200);
    expect(req.body.segments.find((x) => x.id === "c3-s2")!.tts.status).toBe("GENERATING");

    await s.runWorker(5_000);
    const after = (await ed.get<ExerciseContent>("/admin/contents/c3")).body.segments.find((x) => x.id === "c3-s2")!;
    expect(after.tts.status).toBe("READY");
    expect(after.tts.generatedForText).toBe(after.voiceGuide);
  });

  it("검수 중인 콘텐츠는 음성을 만들 수 없다", async () => {
    expect((await (await editor()).post("/admin/contents/c2/tts", { segmentIds: ["c2-s1"] })).status).toBe(403);
  });
});

describe("영상 업로드와 AI 제작 작업", () => {
  it("영상을 올리고 작업을 만들면 작업기가 초안을 만든다", async () => {
    const ed = await editor();
    const up = await ed.post<VideoAsset>("/admin/videos", videoForm("한글 이름 영상.mp4"));
    expect(up.status).toBe(201);
    expect(up.body.fileName).toBe("한글 이름 영상.mp4");
    expect(up.body.durationSec).toBe(95);
    expect(up.body.url).toMatch(/\/media\/videos\/v-.+\.mp4$/);
    // 올린 파일을 재생 주소로 받을 수 있다
    expect((await fetch(up.body.url!)).status).toBe(200);

    const job = await ed.post<ContentJob>("/admin/content-jobs", { videoId: up.body.id, title: "의자 스쿼트", category: "STRENGTH", difficulty: "BEGINNER", requestNote: "천천히" });
    expect(job.status).toBe(201);
    expect(job.body.status).toBe("QUEUED");

    await s.runWorker(2_500);
    const mid = (await ed.get<ContentJob[]>("/admin/content-jobs")).body.find((j) => j.id === job.body.id)!;
    expect(mid.status).toBe("EXTRACTING_STEPS");

    await s.runWorker(60_000);
    const done = (await ed.get<ContentJob[]>("/admin/content-jobs")).body.find((j) => j.id === job.body.id)!;
    expect(done.status).toBe("COMPLETED");
    expect(done.contentId).toBeTruthy();

    const draft = (await ed.get<ExerciseContent>(`/admin/contents/${done.contentId}`)).body;
    expect(draft.status).toBe("DRAFT");
    expect(draft.aiGenerated).toBe(true);
    expect(draft.summary).toBe("");
    expect(draft.internalNote).toContain("천천히");
    expect(draft.segments.length).toBeGreaterThan(0);
    expect(draft.video.id).toBe(up.body.id);

    // 연결된 영상은 지울 수 없다
    expect((await ed.del(`/admin/videos/${up.body.id}`)).status).toBe(409);
  });

  it("영상이 아닌 파일과 길이 없는 영상은 거절한다", async () => {
    const ed = await editor();
    const text = new FormData();
    text.append("file", new Blob(["hello"], { type: "text/plain" }), "a.txt");
    text.append("durationSec", "10");
    expect((await ed.post("/admin/videos", text)).status).toBe(400);
    expect((await ed.post("/admin/videos", videoForm("a.mp4", 0))).status).toBe(400);
  });

  it("연결되지 않은 영상은 지울 수 있다", async () => {
    const ed = await editor();
    const up = await ed.post<VideoAsset>("/admin/videos", videoForm("temp.mp4"));
    expect((await ed.del(`/admin/videos/${up.body.id}`)).status).toBe(204);
    expect((await fetch(up.body.url!)).status).toBe(404);
  });

  it("실패한 작업은 다시 시도할 수 있다", async () => {
    const ed = await editor();
    const up = await ed.post<VideoAsset>("/admin/videos", videoForm("fail-demo.mp4"));
    const job = await ed.post<ContentJob>("/admin/content-jobs", { videoId: up.body.id, title: "실패 시연", category: "CARDIO", difficulty: "BEGINNER", requestNote: "" });
    await s.runWorker(1_500);
    const failed = (await ed.get<ContentJob[]>("/admin/content-jobs")).body.find((j) => j.id === job.body.id)!;
    expect(failed.status).toBe("FAILED");
    const retry = await ed.post<ContentJob>(`/admin/content-jobs/${job.body.id}/retry`);
    expect(retry.body.status).toBe("QUEUED");
    await s.runWorker(60_000);
    const done = (await ed.get<ContentJob[]>("/admin/content-jobs")).body.find((j) => j.id === job.body.id)!;
    expect(done.status).toBe("COMPLETED");
  });

  it("다시 분석하면 구간이 새 결과로 바뀐다", async () => {
    const ed = await editor();
    const c = (await ed.get<ExerciseContent>("/admin/contents/c3")).body;
    const job = await ed.post<ContentJob>("/admin/contents/c3/reanalyze", { requestNote: "구간을 나눠 주세요", expectedVersion: c.version });
    expect(job.status).toBe(201);
    expect(job.body.kind).toBe("REANALYZE");
    // 분석 중에는 수정할 수 없다
    expect((await ed.patch("/admin/contents/c3", { ...c, expectedVersion: c.version })).status).toBe(409);
    await s.runWorker(60_000);
    const after = (await ed.get<ExerciseContent>("/admin/contents/c3")).body;
    expect(after.version).toBe(c.version + 1);
    expect(after.segments.map((x) => x.id)).not.toContain("c3-s1");
    expect(after.internalNote).toContain("구간을 나눠 주세요");
  });

  it("공개 중인 콘텐츠의 영상 재생 주소만 사용자에게 준다", async () => {
    const ed = await editor();
    const up = await ed.post<VideoAsset>("/admin/videos", videoForm("replace.mp4", 75));
    expect((await anon().get(`/videos/${up.body.id}/playback-url`)).status).toBe(404);
    const c = (await ed.get<ExerciseContent>("/admin/contents/c3")).body;
    const replaced = await ed.put<ExerciseContent>("/admin/contents/c3/video", { videoId: up.body.id, expectedVersion: c.version });
    expect(replaced.status).toBe(200);
    expect(replaced.body.video.id).toBe(up.body.id);
    expect(replaced.body.segments.length).toBe(c.segments.length);
  });
});

describe("회원 콘텐츠 올리기 (/me)", () => {
  const member = () => login(s.baseUrl, "member@example.com", "member1234");

  /** 회원이 영상을 올리고 작업이 끝나 초안이 생긴 상태로 만든다 */
  async function memberDraft() {
    const me = await member();
    const up = await me.post<VideoAsset>("/me/videos", videoForm("사이드 레그 레이즈.mp4", 60));
    expect(up.status).toBe(201);
    const job = await me.post<ContentJob>("/me/content-jobs", { videoId: up.body.id, title: "사이드 레그 레이즈", category: "STRENGTH", difficulty: "BEGINNER", requestNote: "" });
    expect(job.status).toBe(201);
    await s.runWorker(60_000);
    const done = await me.get<ContentJob>(`/me/content-jobs/${job.body.id}`);
    expect(done.body.status).toBe("COMPLETED");
    const content = await me.get<MyContent>(`/me/contents/${done.body.contentId}`);
    return { me, video: up.body, content: content.body };
  }

  it("로그인하지 않으면 401", async () => {
    expect((await anon().get("/me/contents")).status).toBe(401);
  });

  it("회원이 올린 영상으로 초안이 생기고, 화면에서만 전달되던 정보가 함께 온다", async () => {
    const { content } = await memberDraft();
    expect(content.status).toBe("DRAFT");
    expect(content.createdBy).toBe("u-member");
    expect("internalNote" in content).toBe(false);
    expect(content.analysis?.findings?.length).toBeGreaterThan(0);
    const mine = await (await member()).get<MyContent[]>("/me/contents");
    expect(mine.body.map((c) => c.id)).toEqual([content.id]);
  });

  it("남이 올린 콘텐츠·작업·영상은 보이지 않는다 (404)", async () => {
    const { content, video } = await memberDraft();
    const ed = await editor();
    expect((await ed.get(`/me/contents/${content.id}`)).status).toBe(404);
    expect((await ed.get<MyContent[]>("/me/contents")).body.some((c) => c.id === content.id)).toBe(false);
    // 남의 영상으로는 작업을 만들 수 없다
    expect((await ed.post("/me/content-jobs", { videoId: video.id, title: "x", category: "STRENGTH", difficulty: "BEGINNER", requestNote: "" })).status).toBe(404);
  });

  it("음성 안내를 고치면 버전이 오르고, 시각 의존 표현이 남으면 검수 요청을 막는다", async () => {
    const { me, content } = await memberDraft();
    const seg = content.segments[1]!;
    const edited = await me.patch<MyContent>(`/me/contents/${content.id}/guides`, {
      expectedVersion: content.version,
      segments: [{ id: seg.id, voiceGuide: "다리를 이렇게 들어 올립니다." }],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.version).toBe(content.version + 1);
    expect(edited.body.segments[1]!.voiceGuide).toBe("다리를 이렇게 들어 올립니다.");

    const blocked = await me.post(`/me/contents/${content.id}/submit`, { expectedVersion: edited.body.version, confirmed: true });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/2단계/);

    // 옛 버전으로 고치면 409
    expect((await me.patch(`/me/contents/${content.id}/guides`, { expectedVersion: content.version, segments: [] })).status).toBe(409);
  });

  it("확인 표시를 하고 검수를 요청하면 운영자가 승인·공개하고, 올린 사람은 승인할 수 없다", async () => {
    const { me, content } = await memberDraft();
    expect((await me.post(`/me/contents/${content.id}/submit`, { expectedVersion: content.version, confirmed: false })).status).toBe(400);
    const sent = await me.post<MyContent>(`/me/contents/${content.id}/submit`, { expectedVersion: content.version, confirmed: true });
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe("IN_REVIEW");
    expect(sent.body.submittedBy).toBe("u-member");

    // 검수 중에는 더 고칠 수 없다
    expect((await me.patch(`/me/contents/${content.id}/guides`, { expectedVersion: sent.body.version, segments: [] })).status).toBe(403);
    // 회원은 관리자 API를 쓸 수 없다
    expect((await me.post(`/admin/contents/${content.id}/actions`, { action: "APPROVE" })).status).toBe(403);

    const ap = await approver();
    expect((await ap.post(`/admin/contents/${content.id}/actions`, { action: "APPROVE" })).status).toBe(200);
    expect((await ap.post(`/admin/contents/${content.id}/actions`, { action: "PUBLISH" })).status).toBe(200);
    const published = await me.get<MyContent>(`/me/contents/${content.id}`);
    expect(published.body.status).toBe("PUBLISHED");

    // 감사 로그에 회원은 역할 없이 남는다
    const logs = await (await superAdmin()).get<{ actorId: string; actorRole: string | null }[]>(`/admin/audit-logs?targetId=${content.id}`);
    expect(logs.body.some((l) => l.actorId === "u-member" && l.actorRole === null)).toBe(true);
  });
});

describe("내 강의 (/me/courses)", () => {
  it("배운 강의를 저장하고 다시 읽는다. 모르는 강의는 400", async () => {
    const me = await login(s.baseUrl, "member@example.com", "member1234");
    expect((await me.get("/me/courses")).body).toEqual({ courseIds: [] });
    const saved = await me.put("/me/courses", { courseIds: ["lower", "stretch", "lower"] });
    expect(saved.status).toBe(200);
    expect([...saved.body.courseIds].sort()).toEqual(["lower", "stretch"]);
    expect((await me.put("/me/courses", { courseIds: ["요리"] })).status).toBe(400);
    expect((await anon().get("/me/courses")).status).toBe(401);
  });

  it("공개 운동의 단계에 짧은 안내가 함께 온다", async () => {
    const squat = (await anon().get<PublishedExercise>("/exercises/c-squat")).body;
    expect(squat.segments[1]!.conciseGuide).toMatch(/스쿼트/);
  });
});
