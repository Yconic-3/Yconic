import type { LearningProfile } from "@yconic/shared-types";
import { describe, expect, it } from "vitest";
import { exerciseGuideLevel, guideIntro, practicedMovements } from "./movement-guides";
import { ruleGuide } from "./learning-api";

const seg = (id: string, movements: string[]) => ({ id, movements, voiceGuide: `자세한 ${id}`, conciseGuide: `짧은 ${id}` }) as never;
const squatVideo = { segments: [seg("s1", []), seg("s2", ["squat"]), seg("s3", ["squat", "arm_raise"]), seg("s4", ["hip_hinge"])] };
const knows = (...ids: string[]): LearningProfile => ({ movements: ids.map((movementId) => ({ movementId, declared: true, sources: ["said"], practiceCount: 0, terms: "" })) as never });

describe("동작 단위 맞춤 안내", () => {
  it("영상 속 동작을 나온 순서대로 모은다", () => {
    expect(practicedMovements(squatVideo)).toEqual(["squat", "arm_raise", "hip_hinge"]);
  });

  it("영상 속 동작을 모두 알아야 영상 전체를 짧게 안내한다", () => {
    expect(exerciseGuideLevel(squatVideo, null)).toBe("detailed");
    expect(exerciseGuideLevel(squatVideo, knows("squat"))).toBe("detailed");
    expect(exerciseGuideLevel(squatVideo, knows("squat", "arm_raise", "hip_hinge"))).toBe("concise");
  });

  it("단계마다: 배운 스쿼트는 짧게, 처음인 힙 힌지는 자세히, 다른 영상의 배운 동작도 똑같이", () => {
    const p = knows("squat");
    expect(ruleGuide(squatVideo.segments[1]!, p)).toMatchObject({ level: "concise", text: "짧은 s2", reason: "스쿼트: 배운 동작이라 짧게" });
    expect(ruleGuide(squatVideo.segments[3]!, p)).toMatchObject({ level: "detailed", text: "자세한 s4" });
    expect(ruleGuide(squatVideo.segments[0]!, p)).toMatchObject({ level: "detailed", reason: "" });
    const chairSquat = { segments: [seg("c1", ["squat"])] };
    expect(ruleGuide(chairSquat.segments[0]!, p).level).toBe("concise");
  });

  it("운동을 열 때 무엇을 짧게, 무엇을 자세히 읽는지 알린다", () => {
    expect(guideIntro(squatVideo, null)).toMatch(/자세히/);
    expect(guideIntro(squatVideo, knows("squat"))).toBe("스쿼트는 배우셨으니 짧게, 팔 들기·돌리기, 힙 힌지는 처음이라 자세히 안내할게요.");
  });
});
