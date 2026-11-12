import type { AgentRequest, AiModel, ClaudeMessage } from "@yconic/ai-common";
import type { VideoAnalyzer } from "@yconic/content-analysis";
import type { ContentJob, LearningProfile, MyContent, PersonalizedGuides, VideoAsset } from "@yconic/shared-types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { login, startTestServer, type TestServer } from "./helpers";

/** 가짜 Claude: 받은 단계마다 정해 둔 글을 돌려준다. 몇 번 불렸는지 센다 */
function fakeAi(textFor: (segmentId: string) => string = (id) => `맞춤 안내 ${id}`) {
  const calls: AgentRequest[] = [];
  const model: AiModel = {
    name: "fake-claude",
    async run(request) {
      calls.push(request);
      const prompt = String(request.messages[0]!.content);
      const ids = [...prompt.matchAll(/segmentId=(\S+)/g)].map((m) => m[1]!);
      const json = { segments: ids.map((segmentId) => ({ segmentId, text: textFor(segmentId) })) };
      return { content: [{ type: "text", text: JSON.stringify(json), citations: null }], stop_reason: "end_turn", model: "fake", usage: {} } as unknown as ClaudeMessage;
    },
  };
  return { model, calls };
}

/** 가짜 실제 분석기: 느린 분석기처럼 진행을 알리고 동작이 붙은 결과를 돌려준다 */
const slowAnalyzer: VideoAnalyzer = {
  slow: true,
  provider: "claude",
  async analyze(input, onProgress) {
    onProgress?.("ANALYZING_VIDEO", 10, "장면");
    onProgress?.("GENERATING_SCRIPT", 55, "안내");
    return {
      provider: "claude",
      model: "fake",
      summary: `${input.title} 분석 (${input.filePath ? "파일 있음" : "파일 없음"})`,
      suggestedTags: ["하체"],
      suggestedPrecautions: ["무릎이 아프면 멈추세요."],
      warnings: [],
      findings: [{ kind: "속도·횟수", text: "3초 내려가기가 자막으로만 나옴" }],
      segments: [
        { kind: "INTRO", startSec: 0, endSec: 10, title: "준비", instruction: "", voiceGuide: "두 발을 어깨너비로 벌리고 섭니다.", conciseGuide: "준비.", movements: [], repetitions: null, confidence: 0.9 },
        { kind: "EXERCISE", startSec: 10, endSec: 50, title: "스쿼트", instruction: "", voiceGuide: "엉덩이를 뒤로 빼며 셋을 세는 동안 내려갑니다.", conciseGuide: "스쿼트 10회.", movements: ["squat"], repetitions: 10, confidence: 0.8 },
        { kind: "EXERCISE", startSec: 50, endSec: 60, title: "팔굽혀펴기", instruction: "", voiceGuide: "엎드려 두 손을 어깨 아래에 둡니다.", conciseGuide: "팔굽혀펴기 5회.", movements: ["pushup"], repetitions: 5, confidence: 0.7 },
      ],
    };
  },
};

let s: TestServer;
const ai = fakeAi();
const member = () => login(s.baseUrl, "member@example.com", "member1234");

beforeAll(async () => {
  s = await startTestServer({ ai: ai.model, analyzer: slowAnalyzer });
});
afterAll(async () => {
  await s?.close();
});
beforeEach(async () => {
  await s.reset();
  ai.calls.length = 0;
});

describe("학습 프로필 (/me/learning)", () => {
  it("직접 알린 동작, 강의로 배운 동작, 세 번 따라 한 동작을 아는 동작으로 모은다", async () => {
    const me = await member();
    expect((await me.get<LearningProfile>("/me/learning")).body.movements).toEqual([]);

    const said = await me.put<LearningProfile>("/me/learning/movements/squat", { known: true, terms: "엉덩이 뒤로 = 힙 힌지" });
    expect(said.body.movements).toEqual([{ movementId: "squat", declared: true, sources: ["said"], practiceCount: 0, terms: "엉덩이 뒤로 = 힙 힌지" }]);

    await me.put("/me/courses", { courseIds: ["upper"] });
    const withCourse = (await me.get<LearningProfile>("/me/learning")).body;
    expect(withCourse.movements.find((m) => m.movementId === "pushup")).toMatchObject({ declared: true, sources: ["course"] });

    for (let i = 0; i < 3; i++) await me.post("/me/learning/practice", { movementIds: ["lunge"] });
    const practiced = (await me.get<LearningProfile>("/me/learning")).body.movements.find((m) => m.movementId === "lunge")!;
    expect(practiced).toMatchObject({ declared: false, practiceCount: 3, sources: ["practice"] });

    expect((await me.put("/me/learning/movements/yoga", { known: true })).status).toBe(400);
  });
});

describe("맞춤 안내 (/me/guides/:exerciseId)", () => {
  it("아는 동작이 없으면 AI를 부르지 않고 자세한 안내를 그대로 준다", async () => {
    const me = await member();
    const g = (await me.get<PersonalizedGuides>("/me/guides/c-squat")).body;
    expect(g.generatedBy).toBe("rule");
    expect(g.segments.every((x) => x.level === "detailed")).toBe(true);
    expect(ai.calls).toHaveLength(0);
  });

  it("스쿼트를 배우면 AI가 다시 쓰고, 저장해 두었다가 프로필이 바뀌면 다시 만든다", async () => {
    const me = await member();
    await me.put("/me/learning/movements/squat", { known: true });
    const g = (await me.get<PersonalizedGuides>("/me/guides/c-squat")).body;
    expect(g.generatedBy).toBe("ai");
    const squat = g.segments.find((x) => x.segmentId === "c-squat-s2")!;
    expect(squat.level).toBe("concise");
    expect(squat.text).toBe("맞춤 안내 c-squat-s2");
    expect(squat.reason).toMatch(/스쿼트.*짧게/);
    // 뒤꿈치 들기는 배우지 않았으므로 자세하게
    expect(g.segments.find((x) => x.segmentId === "c-squat-s4")!.level).toBe("detailed");
    expect(ai.calls).toHaveLength(1);

    await me.get("/me/guides/c-squat");
    expect(ai.calls).toHaveLength(1); // 저장된 것을 쓴다

    await me.put("/me/learning/movements/calf_raise", { known: true });
    const again = (await me.get<PersonalizedGuides>("/me/guides/c-squat")).body;
    expect(again.segments.find((x) => x.segmentId === "c-squat-s4")!.level).toBe("concise");
    expect(ai.calls).toHaveLength(2);
  });

  it("배운 스쿼트는 다른 영상에서도 짧게: 관계없는 영상(목 스트레칭)은 AI를 부르지 않는다", async () => {
    const me = await member();
    await me.put("/me/learning/movements/squat", { known: true });
    const neck = (await me.get<PersonalizedGuides>("/me/guides/c-neck")).body;
    expect(neck.generatedBy).toBe("rule");
    expect(ai.calls).toHaveLength(0);
  });

  it("AI가 화면 의존 표현을 쓰면 그 단계만 규칙 안내로 둔다", async () => {
    const visualAi = fakeAi((id) => (id === "c-squat-s2" ? "이렇게 앉으세요." : `맞춤 ${id}`));
    const s2 = await startTestServer({ ai: visualAi.model });
    try {
      const me = await login(s2.baseUrl, "member@example.com", "member1234");
      await me.put("/me/learning/movements/squat", { known: true });
      const g = (await me.get<PersonalizedGuides>("/me/guides/c-squat")).body;
      expect(g.segments.find((x) => x.segmentId === "c-squat-s2")!.text).toMatch(/스쿼트/); // 미리 만든 짧은 안내
      expect(g.segments.find((x) => x.segmentId === "c-squat-s4")!.text).toBe("맞춤 c-squat-s4");
    } finally {
      await s2.close();
    }
  });

  it("공개되지 않은 운동은 404", async () => {
    const me = await member();
    expect((await me.get("/me/guides/c2")).status).toBe(404);
  });
});

describe("실제(느린) 영상 분석기 경로", () => {
  it("분석을 따로 돌려 초안을 만들고, 단계에 동작을 붙이며, 가짜 음성 파일은 만들지 않는다", async () => {
    const me = await member();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(1024)], { type: "video/mp4" }), "squat.mp4");
    form.append("durationSec", "60");
    form.append("width", "1280");
    form.append("height", "720");
    const video = (await me.post<VideoAsset>("/me/videos", form)).body;
    const job = (await me.post<ContentJob>("/me/content-jobs", { videoId: video.id, title: "스쿼트", category: "STRENGTH", difficulty: "BEGINNER", requestNote: "" })).body;

    await s.runWorker();
    await s.waitWorker();
    const done = (await me.get<ContentJob>(`/me/content-jobs/${job.id}`)).body;
    expect(done.status).toBe("COMPLETED");
    const c = (await me.get<MyContent>(`/me/contents/${done.contentId}`)).body;
    expect(c.analysis?.summary).toBe("스쿼트 분석 (파일 있음)");
    expect(c.segments.map((x) => x.movements)).toEqual([[], ["squat"], ["pushup"]]);
    expect(c.segments.every((x) => x.tts.status === "NONE")).toBe(true);
  });
});
