import { describe, expect, it } from "vitest";
import { attachNarration, fitSpeechRate, hasNarration, isNarrationAt, speechBudgetChars } from "./narration";

const segs = [
  { startSec: 0, endSec: 10 },
  { startSec: 10, endSec: 30 },
];
const lines = [
  { startSec: 1, endSec: 4, text: "안녕하세요" },
  { startSec: 8, endSec: 13, text: "첫 동작입니다" }, // 가운데 10.5초 → 둘째 단계
  { startSec: 29, endSec: 31, text: "끝" }, // 마지막 단계는 끝을 조금 넘어도 담는다
];

describe("영상 속 강사 말과 안내가 겹치지 않게", () => {
  it("받아 적은 말을 가운데 시각이 속한 단계에 나눠 담는다", () => {
    const out = attachNarration(segs, lines);
    expect(out[0]!.narration.map((l) => l.text)).toEqual(["안녕하세요"]);
    expect(out[1]!.narration.map((l) => l.text)).toEqual(["첫 동작입니다", "끝"]);
    expect(hasNarration(out)).toBe(true);
    expect(hasNarration([{ narration: [] }, {}])).toBe(false);
  });

  it("강사가 말하는 시각(앞뒤 0.3초 포함)인지 안다", () => {
    const out = attachNarration(segs, lines);
    expect(isNarrationAt(out, 0.8)).toBe(true);
    expect(isNarrationAt(out, 6)).toBe(false);
    expect(isNarrationAt(out, 13.2)).toBe(true);
  });

  it("안내를 단계 안에 다 읽도록 말 속도를 맞춘다", () => {
    expect(fitSpeechRate("가".repeat(20), 10)).toBe(1); // 5초면 충분
    expect(fitSpeechRate("가".repeat(60), 10)).toBeCloseTo(1.58, 1); // 15초 분량 → 빠르게
    expect(fitSpeechRate("가".repeat(200), 10)).toBe(1.6); // 최대 속도에서 멈춘다
    expect(fitSpeechRate("가".repeat(20), 10, 1.2)).toBe(1.2); // 사용자가 고른 속도보다 느려지지 않는다
    expect(speechBudgetChars(10)).toBe(36);
  });
});
