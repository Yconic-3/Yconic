import { describe, expect, it } from "vitest";
import { parseIntent, type IntentExercise } from "./intent";

const exercises: IntentExercise[] = [
  { id: "c-neck", title: "앉아서 하는 목 스트레칭", tags: ["목", "앉아서"] },
  { id: "c-squat", title: "의자 잡고 스쿼트", tags: ["하체", "의자"] },
  { id: "c-wall", title: "벽 밀기 상체 운동", tags: ["상체", "벽"] },
  { id: "c-march", title: "제자리 걷기", tags: ["걷기", "전신"] },
];

const parse = (text: string) => parseIntent(text, exercises);

describe("parseIntent", () => {
  it("위험 신호는 다른 말이 섞여 있어도 가장 먼저 잡는다", () => {
    expect(parse("무릎이 아파 다음")).toEqual({ type: "SAFETY" });
    expect(parse("좀 어지러워")).toEqual({ type: "SAFETY" });
    expect(parse("숨이 차요")).toEqual({ type: "SAFETY" });
  });

  it("화면 이동", () => {
    expect(parse("홈")).toEqual({ type: "HOME" });
    expect(parse("처음으로 가줘")).toEqual({ type: "HOME" });
    expect(parse("이전 화면")).toEqual({ type: "BACK" });
    expect(parse("뒤로 가기")).toEqual({ type: "BACK" });
  });

  it("'이전'과 '뒤로'만 말하면 화면이 아니라 이전 단계다", () => {
    expect(parse("이전")).toEqual({ type: "PREVIOUS" });
    expect(parse("뒤로")).toEqual({ type: "PREVIOUS" });
  });

  it("분류로 찾기", () => {
    expect(parse("스트레칭 찾아줘")).toEqual({ type: "LIST", category: "STRETCHING", keyword: null });
    expect(parse("근력 운동 추천해줘")).toEqual({ type: "LIST", category: "STRENGTH", keyword: null });
  });

  it("태그로 찾기", () => {
    expect(parse("하체 운동 찾아줘")).toEqual({ type: "LIST", category: null, keyword: "하체" });
  });

  it("'목록'을 태그 '목'으로 잘못 읽지 않는다", () => {
    expect(parse("운동 목록 보여줘")).toEqual({ type: "LIST", category: null, keyword: null });
  });

  it("분류만 말해도 목록으로 본다", () => {
    expect(parse("유산소")).toEqual({ type: "LIST", category: "CARDIO", keyword: null });
  });

  it("운동 이름으로 열기", () => {
    expect(parse("스쿼트")).toEqual({ type: "OPEN", exerciseId: "c-squat", autoplay: false });
    expect(parse("스쿼트 시작")).toEqual({ type: "OPEN", exerciseId: "c-squat", autoplay: true });
    expect(parse("제자리 걷기 해줘")).toEqual({ type: "OPEN", exerciseId: "c-march", autoplay: true });
    expect(parse("앉아서 하는 목 스트레칭")).toEqual({ type: "OPEN", exerciseId: "c-neck", autoplay: false });
  });

  it("재생 명령", () => {
    expect(parse("시작")).toEqual({ type: "START" });
    expect(parse("계속")).toEqual({ type: "START" });
    expect(parse("멈춰")).toEqual({ type: "PAUSE" });
    expect(parse("잠깐만")).toEqual({ type: "PAUSE" });
    expect(parse("다음")).toEqual({ type: "NEXT" });
    expect(parse("다시")).toEqual({ type: "REPEAT" });
    expect(parse("한 번 더")).toEqual({ type: "REPEAT" });
  });

  it("말하기 속도", () => {
    expect(parse("느리게")).toEqual({ type: "SLOWER" });
    expect(parse("다시 천천히")).toEqual({ type: "SLOWER" });
    expect(parse("빠르게")).toEqual({ type: "FASTER" });
  });

  it("도움말과 알 수 없는 말", () => {
    expect(parse("도움말")).toEqual({ type: "HELP" });
    expect(parse("오늘 날씨 어때")).toEqual({ type: "UNKNOWN" });
    expect(parse("   ")).toEqual({ type: "UNKNOWN" });
  });
});
