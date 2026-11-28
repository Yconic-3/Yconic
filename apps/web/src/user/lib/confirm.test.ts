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

  it("여러 낱말로 하는 대답도 알아듣는다", () => {
    for (const t of ["네 해 줘", "응 그렇게 해 줘", "그렇게 해 주세요", "네네", "넵", "좋아요 시작할게요", "그래 가자", "네 다음 단계로 넘어가 줘", "바로 시작해", "응 틀어 줘", "그걸로 하자", "예 부탁드립니다", "어", "ㅇㅇ", "ok", "넘어가도 돼요", "계속해 주세요"]) {
      expect(classifyAnswer(t), t).toBe("yes");
    }
  });

  it("새 요청은 '네'로 듣지 않는다 (대답하는 낱말이 들어 있어도)", () => {
    // 예전에는 '해 줘', '다음', '좋아', '시작', '예', '응'이 들어 있다는 것만으로 '네'가 됐다
    for (const t of ["추천해 줘", "오늘 뭐 할지 추천해 줘", "쉽게 설명해 줘", "다음 운동 뭐야", "뭐가 좋아?", "어떤 게 좋아요", "스쿼트 시작", "스쿼트 틀어 줘", "예전 거 틀어 줘", "응원해 줘", "목록 보여 줘", "하체 운동 할래", "천천히 말해 줘"]) {
      expect(classifyAnswer(t), t).toBeNull();
    }
  });

  it("붙는 말만으로는 대답이 아니다", () => {
    for (const t of ["그거", "지금 바로", "단계"]) expect(classifyAnswer(t), t).toBeNull();
  });

  it("하지 말자는 말이 섞여 있으면 하지 말자는 뜻이다", () => {
    for (const t of ["아니 그거 말고", "잠깐 기다려", "응 아니야", "나중에 할게"]) expect(classifyAnswer(t), t).toBe("no");
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
