import { describe, expect, it } from "vitest";
import { classifyAnswer } from "./confirm";
import { recommendNext, timesDone } from "./history";

describe("묻고 기다리기: 대답 알아듣기", () => {
  it("네·다음·좋아는 하자는 뜻", () => {
    for (const t of ["네", "네.", "예", "응", "좋아요", "다음", "넘어가 줘", "계속", "그래"]) expect(classifyAnswer(t)).toBe("yes");
  });
  it("아니·잠깐·그만은 하지 말자는 뜻", () => {
    for (const t of ["아니", "아니요", "잠깐만", "그만", "나중에", "아니 다음 거 말고"]) expect(classifyAnswer(t)).toBe("no");
  });
  it("긴 말이나 다른 말은 대답이 아니다", () => {
    expect(classifyAnswer("무릎을 어떻게 굽혀야 하는지 알려 줘")).toBeNull();
    expect(classifyAnswer("스트레칭")).toBeNull();
  });
});

describe("다음 운동 고르기", () => {
  const ex = (id: string, category: string, tags: string[], sec: number) => ({ id, title: id, category, tags, video: { durationSec: sec } }) as never;
  const list = [ex("squat", "STRENGTH", ["하체"], 100), ex("neck", "STRETCHING", ["목"], 60), ex("chair", "STRENGTH", ["하체"], 90), ex("wall", "STRENGTH", ["상체"], 80)];

  it("덜 해 본 운동, 그다음 부위가 다른 운동, 그다음 짧은 운동", () => {
    expect(recommendNext(list, "squat", [])?.id).toBe("neck"); // 부위 다름 + 짧음
    const history = [{ exerciseId: "neck", at: 1 }, { exerciseId: "wall", at: 2 }];
    expect(recommendNext(list, "squat", history)?.id).toBe("chair"); // 안 해 본 것
    expect(timesDone(history, "neck")).toBe(1);
  });
});
