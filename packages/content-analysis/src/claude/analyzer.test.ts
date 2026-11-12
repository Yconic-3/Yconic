import { describe, expect, it } from "vitest";
import type { AgentRequest, AiModel, ClaudeMessage, RunOptions } from "@yconic/ai-common";
import { createClaudeVideoAnalyzer, normalizeSegments } from "./analyzer";
import type { MediaTools } from "./media";

const input = { videoId: "v1", durationSec: 60, title: "스쿼트", category: "STRENGTH", difficulty: "BEGINNER", requestNote: "", filePath: "C:/v.mp4" };

function seg(over: Partial<Parameters<typeof normalizeSegments>[0][number]> = {}) {
  return {
    kind: "EXERCISE",
    startSec: 0,
    endSec: 30,
    title: "스쿼트",
    instruction: "앉았다 일어선다",
    voiceGuide: "두 발을 어깨너비로 벌리고 엉덩이를 뒤로 빼며 셋을 세는 동안 내려갑니다.",
    conciseGuide: "스쿼트 10회.",
    repetitions: 10,
    movements: ["squat"],
    confidence: 0.8,
    ...over,
  };
}

function fakeModel(json: unknown, stop: ClaudeMessage["stop_reason"] = "end_turn") {
  const calls: { request: AgentRequest; options?: RunOptions }[] = [];
  const model: AiModel = {
    name: "fake",
    async run(request, options) {
      calls.push({ request, options });
      return { content: [{ type: "text", text: JSON.stringify(json), citations: null }], stop_reason: stop, model: "fake", usage: {} } as unknown as ClaudeMessage;
    },
  };
  return { model, calls };
}

const media = (transcribeFails = false): MediaTools => ({
  extractFrames: async () => [
    { atSec: 0, jpegBase64: "AAA" },
    { atSec: 4, jpegBase64: "BBB" },
  ],
  transcribe: async () => {
    if (transcribeFails) throw new Error("python 없음");
    return [{ start: 1, end: 4, text: "자, 스쿼트 열 번 해 볼게요" }];
  },
});

const answer = {
  summary: "스쿼트 영상",
  suggestedTags: ["하체"],
  suggestedPrecautions: ["무릎이 아프면 멈추세요."],
  warnings: [],
  findings: [{ kind: "속도·횟수", text: "10초쯤 '3초 내려가기'가 자막으로만 나옴" }],
  segments: [seg({ kind: "INTRO", startSec: 0, endSec: 8, movements: [], repetitions: 0, title: "준비" }), seg({ startSec: 6, endSec: 70 })],
};

describe("Claude 영상 분석기", () => {
  it("장면과 받아 적은 말을 함께 보내고, 정해진 JSON 모양으로 받는다", async () => {
    const { model, calls } = fakeModel(answer);
    const stages: string[] = [];
    const result = await createClaudeVideoAnalyzer({ model, media: media() }).analyze(input, (stage) => stages.push(stage));
    expect(stages).toEqual(["ANALYZING_VIDEO", "EXTRACTING_STEPS", "GENERATING_SCRIPT", "GENERATING_TTS"]);
    const content = calls[0]!.request.messages[0]!.content as { type: string; text?: string }[];
    expect(content.filter((b) => b.type === "image")).toHaveLength(2);
    expect(content[0]!.text).toContain("자, 스쿼트 열 번 해 볼게요");
    expect(calls[0]!.options?.jsonSchema).toBeTruthy();
    expect(result.provider).toBe("claude");
    expect(result.findings).toHaveLength(1);
    // 겹침을 없애고 영상 길이 안으로 자른다
    expect(result.segments.map((s) => [s.startSec, s.endSec])).toEqual([
      [0, 8],
      [8, 60],
    ]);
    expect(result.segments[0]!.repetitions).toBeNull();
    expect(result.segments[1]!.movements).toEqual(["squat"]);
  });

  it("받아쓰기에 실패해도 화면만 보고 분석하고 경고를 남긴다", async () => {
    const { model } = fakeModel(answer);
    const result = await createClaudeVideoAnalyzer({ model, media: media(true) }).analyze(input);
    expect(result.warnings[0]).toMatch(/받아 적지 못해/);
  });

  it("화면 의존 표현이 남으면 경고하고, 목록에 없는 동작은 뺀다", async () => {
    const { model } = fakeModel({ ...answer, segments: [seg({ voiceGuide: "다리를 이렇게 올립니다.", movements: ["squat", "요가"] })] });
    const result = await createClaudeVideoAnalyzer({ model, media: media() }).analyze(input);
    expect(result.warnings.some((w) => w.includes("이렇게"))).toBe(true);
    expect(result.segments[0]!.movements).toEqual(["squat"]);
  });

  it("파일이 없거나 거절되면 실패한다", async () => {
    const { model } = fakeModel(answer);
    await expect(createClaudeVideoAnalyzer({ model, media: media() }).analyze({ ...input, filePath: null })).rejects.toThrow(/영상 파일이 없어/);
    const refused = fakeModel(answer, "refusal");
    await expect(createClaudeVideoAnalyzer({ model: refused.model, media: media() }).analyze(input)).rejects.toThrow(/거절/);
  });
});
