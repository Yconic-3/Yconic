import { describe, expect, it } from "vitest";
import { afterWakeWord, createCommandGate } from "./wake-word";

describe("부르면 듣기 (호출어)", () => {
  it("호출어 뒤의 말을 꺼낸다. 띄어 쓰거나 부름말이 붙어도 알아듣는다", () => {
    expect(afterWakeWord("소리벗 멈춰")).toBe("멈춰");
    expect(afterWakeWord("소리 벗아, 다음 단계")).toBe("다음 단계");
    expect(afterWakeWord("소리벗")).toBe("");
    expect(afterWakeWord("엉덩이를 뒤로 빼 주세요")).toBeNull();
    // 강사의 말 뒤에 이어서 불러도 마지막 호출어 뒤만 본다
    expect(afterWakeWord("올라와 주세요 소리벗 천천히")).toBe("천천히");
  });

  it("호출어 없는 말(영상 속 강사의 말 등)은 명령으로 받지 않는다", () => {
    const gate = createCommandGate();
    expect(gate.feed("발을 어깨너비로 벌려 주세요")).toBeNull();
    expect(gate.feed("다음")).toBeNull();
  });

  it("호출어만 부르면 듣기 상태가 되고, 다음 한 마디를 명령으로 받는다", () => {
    let t = 0;
    const gate = createCommandGate(() => t, 8000);
    expect(gate.feed("소리벗")).toEqual({ kind: "armed" });
    t = 3000;
    expect(gate.feed("멈춰")).toEqual({ kind: "command", text: "멈춰" });
    expect(gate.feed("다음")).toBeNull(); // 한 마디만
  });

  it("듣기 상태는 정해진 시간이 지나면 풀린다. 버튼을 누르면 듣기 상태가 된다", () => {
    let t = 0;
    const gate = createCommandGate(() => t, 8000);
    gate.arm();
    t = 9000;
    expect(gate.isArmed()).toBe(false);
    expect(gate.feed("멈춰")).toBeNull();
    gate.arm();
    expect(gate.feed("소리벗 계속")).toEqual({ kind: "command", text: "계속" });
  });
});
