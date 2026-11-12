import { describe, expect, it } from "vitest";
import { canCreatorEdit, creatorSubmitBlockedReason, stepsWithVisualPhrases, type ExerciseSegment } from "./index";

function segment(id: string, voiceGuide: string, startSec: number, endSec: number): ExerciseSegment {
  return {
    id,
    order: 1,
    kind: "EXERCISE",
    startSec,
    endSec,
    title: "동작",
    instruction: "",
    voiceGuide,
    repetitions: null,
    tts: { status: "NONE", audioUrl: null, generatedForText: null, failureReason: null },
  };
}

const draft = {
  status: "DRAFT" as const,
  title: "사이드 레그 레이즈",
  summary: "",
  precautions: ["아프면 멈추세요."],
  video: { durationSec: 60 },
  segments: [segment("s1", "오른쪽으로 눕습니다.", 0, 30), segment("s2", "위쪽 다리를 천장 쪽으로 2초에 걸쳐 들어 올립니다.", 30, 60)],
};

describe("회원 콘텐츠 올리기 규칙", () => {
  it("초안과 수정 요청 상태만 고칠 수 있다", () => {
    expect(canCreatorEdit({ status: "DRAFT" })).toBe(true);
    expect(canCreatorEdit({ status: "CHANGES_REQUESTED" })).toBe(true);
    expect(canCreatorEdit({ status: "IN_REVIEW" })).toBe(false);
    expect(canCreatorEdit({ status: "PUBLISHED" })).toBe(false);
  });

  it("확인 표시를 하면 검수를 요청할 수 있다 (요약이 비어도, 음성 파일이 없어도)", () => {
    expect(creatorSubmitBlockedReason(draft, true)).toBeNull();
    expect(creatorSubmitBlockedReason(draft, false)).toMatch(/확인했다는 표시/);
  });

  it("시각 의존 표현이 남은 단계가 있으면 막는다", () => {
    const visual = { ...draft, segments: [draft.segments[0]!, segment("s2", "다리를 이렇게 들어 올립니다.", 30, 60)] };
    expect(stepsWithVisualPhrases(visual)).toEqual([2]);
    expect(creatorSubmitBlockedReason(visual, true)).toMatch(/2단계/);
  });

  it("음성 안내가 빈 단계는 막지 않는다 (운영자가 판단)", () => {
    const empty = { ...draft, segments: [draft.segments[0]!, segment("s2", "", 30, 60)] };
    expect(creatorSubmitBlockedReason(empty, true)).toBeNull();
  });

  it("검수 중이면 요청할 수 없다", () => {
    expect(creatorSubmitBlockedReason({ ...draft, status: "IN_REVIEW" }, true)).toMatch(/검수 중/);
  });
});
