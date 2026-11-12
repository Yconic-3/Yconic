import { describe, expect, it } from "vitest";
import { findMovementInText, knowsMovement, ruleGuideText, segmentGuideLevel, type LearningProfile } from "./index";

const profile = (movements: LearningProfile["movements"]): LearningProfile => ({ movements });
const knows = (id: LearningProfile["movements"][number]["movementId"], extra: Partial<LearningProfile["movements"][number]> = {}) => ({
  movementId: id,
  declared: true,
  sources: ["said" as const],
  practiceCount: 0,
  terms: "",
  ...extra,
});

const squatStep = { voiceGuide: "두 발을 어깨너비로 벌리고 엉덩이를 뒤로 빼며 셋을 세는 동안 내려갑니다.", conciseGuide: "스쿼트 10회.", movements: ["squat" as const] };
const pushupStep = { voiceGuide: "엎드려 두 손을 어깨 아래에 둡니다.", conciseGuide: "팔굽혀펴기 8회.", movements: ["pushup" as const] };
const restStep = { voiceGuide: "잠시 쉽니다.", conciseGuide: "휴식.", movements: [] };

describe("동작 단위 맞춤 안내", () => {
  it("말에서 동작을 찾는다", () => {
    expect(findMovementInText("스쿼트 배웠어")).toBe("squat");
    expect(findMovementInText("푸시업 강의 들었어요")).toBe("pushup");
    expect(findMovementInText("벽 밀기 해봤어")).toBe("wall_pushup");
    expect(findMovementInText("요리 배웠어")).toBeNull();
  });

  it("배웠다고 알렸거나 3번 끝까지 따라 하면 아는 동작이다", () => {
    expect(knowsMovement(profile([knows("squat")]), "squat")).toBe(true);
    expect(knowsMovement(profile([knows("squat", { declared: false, practiceCount: 2 })]), "squat")).toBe(false);
    expect(knowsMovement(profile([knows("squat", { declared: false, practiceCount: 3 })]), "squat")).toBe(true);
    expect(knowsMovement(null, "squat")).toBe(false);
  });

  it("스쿼트를 배운 사람은 어느 영상이든 스쿼트 단계만 짧게, 팔굽혀펴기는 자세하게", () => {
    const p = profile([knows("squat")]);
    expect(segmentGuideLevel(squatStep, p)).toBe("concise");
    expect(segmentGuideLevel(pushupStep, p)).toBe("detailed");
    expect(ruleGuideText(squatStep, p)).toBe("스쿼트 10회.");
    expect(ruleGuideText(pushupStep, p)).toBe(pushupStep.voiceGuide);
  });

  it("동작이 없는 단계, 로그인 전, 여러 동작 중 하나라도 처음이면 자세하게", () => {
    const p = profile([knows("squat")]);
    expect(segmentGuideLevel(restStep, p)).toBe("detailed");
    expect(segmentGuideLevel(squatStep, null)).toBe("detailed");
    expect(segmentGuideLevel({ movements: ["squat", "pushup"] }, p)).toBe("detailed");
  });
});
