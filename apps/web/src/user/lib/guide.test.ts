import { describe, expect, it } from "vitest";
import { GUIDE_SPEECH_BODY, GUIDE_STEPS, isGuideSkip, parseGuideSeen } from "./guide";

describe("parseGuideSeen", () => {
  it("저장된 것이 없으면 아무것도 안 본 것이다", () => {
    expect(parseGuideSeen(null)).toEqual({ intro: false, tips: [] });
    expect(parseGuideSeen("")).toEqual({ intro: false, tips: [] });
  });
  it("본 것을 그대로 읽는다", () => {
    expect(parseGuideSeen('{"intro":true,"tips":["exercise"]}')).toEqual({ intro: true, tips: ["exercise"] });
  });
  it("망가진 글이나 모르는 값은 버린다", () => {
    expect(parseGuideSeen("{")).toEqual({ intro: false, tips: [] });
    expect(parseGuideSeen("null")).toEqual({ intro: false, tips: [] });
    expect(parseGuideSeen('{"intro":"yes","tips":["exercise","없는것",3]}')).toEqual({ intro: false, tips: ["exercise"] });
    expect(parseGuideSeen('{"intro":true,"tips":"exercise"}')).toEqual({ intro: true, tips: [] });
  });
});

describe("isGuideSkip", () => {
  it("그만 보겠다는 짧은 말", () => {
    for (const t of ["건너뛰기", "건너뛰어", "닫아 줘", "그만", "됐어", "알겠어"]) expect(isGuideSkip(t)).toBe(true);
  });
  it("다른 말이나 긴 말은 아니다", () => {
    for (const t of ["", "스쿼트 시작", "사용법 알려줘", "알겠는데 하체 운동은 어디서 찾아야 해"]) expect(isGuideSkip(t)).toBe(false);
  });
});

describe("안내 문구", () => {
  it("세 가지로 짧게 알려 준다", () => {
    expect(GUIDE_STEPS).toHaveLength(3);
    expect(GUIDE_SPEECH_BODY).toContain("사용법 알려줘");
  });
});
