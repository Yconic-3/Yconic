import { describe, expect, it } from "vitest";
import { courseOfExercise, guideLevelFor, guideTextOf } from "./index";

const squat = { category: "STRENGTH" as const, tags: ["하체", "의자"] };
const neck = { category: "STRETCHING" as const, tags: ["목"] };
const march = { category: "CARDIO" as const, tags: ["걷기"] };

describe("내 강의", () => {
  it("분류나 꼬리표로 운동이 속한 강의를 찾는다", () => {
    expect(courseOfExercise(squat)).toBe("lower");
    expect(courseOfExercise(neck)).toBe("stretch");
    expect(courseOfExercise(march)).toBeNull();
  });

  it("배운 강의의 운동만 짧게, 로그인 전이나 처음 하는 운동은 자세하게", () => {
    expect(guideLevelFor(squat, ["lower"])).toBe("concise");
    expect(guideLevelFor(squat, ["core"])).toBe("detailed");
    expect(guideLevelFor(squat, null)).toBe("detailed");
    expect(guideLevelFor(march, ["lower", "core", "upper", "stretch"])).toBe("detailed");
  });

  it("짧은 안내가 비어 있으면 자세한 안내를 읽는다", () => {
    expect(guideTextOf({ voiceGuide: "자세히", conciseGuide: "짧게" }, "concise")).toBe("짧게");
    expect(guideTextOf({ voiceGuide: "자세히", conciseGuide: " " }, "concise")).toBe("자세히");
    expect(guideTextOf({ voiceGuide: "자세히" }, "concise")).toBe("자세히");
    expect(guideTextOf({ voiceGuide: "자세히", conciseGuide: "짧게" }, "detailed")).toBe("자세히");
  });
});
