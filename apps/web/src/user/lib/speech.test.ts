import { describe, expect, it } from "vitest";
import { splitSentences } from "./speech";

describe("긴 안내를 문장마다 나눠 읽기", () => {
  it("문장 끝에서 나누고, 너무 짧은 조각은 앞 문장에 붙인다", () => {
    expect(splitSentences("2단계, 내려가기. 숨을 들이마시며 앉으세요. 좋아요! 다음은 일어서기예요?")).toEqual([
      "2단계, 내려가기.",
      "숨을 들이마시며 앉으세요. 좋아요!",
      "다음은 일어서기예요?",
    ]);
  });

  it("문장 부호가 없으면 통째로 읽는다", () => {
    expect(splitSentences("천천히 숨 쉬세요")).toEqual(["천천히 숨 쉬세요"]);
  });
});
