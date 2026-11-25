import { describe, expect, it } from "vitest";
import { createEchoFilter, echoScore } from "./echo";
import { createUtteranceBuffer } from "./recognition";

describe("메아리 거르기", () => {
  it("앱이 방금 읽은 말이 다시 들리면 메아리로 본다", () => {
    const f = createEchoFilter(12_000);
    f.spoke("2단계, 내려가기. 숨을 들이마시며 엉덩이를 뒤로 빼세요.", 0);
    expect(f.isEcho("숨을 들이마시며 엉덩이를 뒤로", 1000)).toBe(true);
    expect(f.isEcho("엉덩이 뒤로 빼세요", 1000)).toBe(true);
  });

  it("사람이 한 다른 말은 메아리가 아니다", () => {
    const f = createEchoFilter(12_000);
    f.spoke("2단계, 내려가기. 숨을 들이마시며 엉덩이를 뒤로 빼세요.", 0);
    expect(f.isEcho("다음 단계로 가 줘", 1000)).toBe(false);
    expect(f.isEcho("무릎이 아파요", 1000)).toBe(false);
  });

  it("시간이 지나면 잊는다", () => {
    const f = createEchoFilter(12_000);
    f.spoke("다음 단계로 갈까요?", 0);
    expect(f.isEcho("다음 단계로 갈까요", 2000)).toBe(true);
    expect(f.isEcho("다음 단계로 갈까요", 20_000)).toBe(false);
  });

  it("글자 조각이 겹치는 비율", () => {
    expect(echoScore("엉덩이를 뒤로", "엉덩이를 뒤로 빼세요")).toBe(1);
    expect(echoScore("네", "네")).toBe(1);
    expect(echoScore("계속", "멈췄어요")).toBe(0);
  });
});

describe("말 끝 기다리기", () => {
  it("짧은 쉼에는 넘기지 않고, 1.3초 넘게 조용하면 모은 말을 한 번에 넘긴다", () => {
    const b = createUtteranceBuffer(1300);
    b.push("무릎이 좀", 0);
    expect(b.take(500)).toBeNull();
    b.touch(800); // 아직 말하는 중
    b.push("아픈 것 같아요", 1500);
    expect(b.take(2000)).toBeNull();
    expect(b.take(2900)).toBe("무릎이 좀 아픈 것 같아요");
    expect(b.take(5000)).toBeNull();
  });
});
