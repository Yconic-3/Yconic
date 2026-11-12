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

describe("parseIntent — 앱 전체 명령 (시안 D)", () => {
  it("계정", () => {
    expect(parse("로그인")).toEqual({ type: "ACCOUNT" });
    expect(parse("내 계정 보여줘")).toEqual({ type: "ACCOUNT" });
    expect(parse("로그아웃 해줘")).toEqual({ type: "LOGOUT" });
  });

  it("음성 안내 켜기·끄기·잠시 멈춤·이어 읽기", () => {
    expect(parse("음성 안내 꺼줘")).toEqual({ type: "TTS_OFF" });
    expect(parse("소리 켜")).toEqual({ type: "TTS_ON" });
    expect(parse("음성 멈춰")).toEqual({ type: "TTS_PAUSE" });
    expect(parse("이어 읽어줘")).toEqual({ type: "TTS_RESUME" });
  });

  it("마이크 허용", () => {
    expect(parse("마이크 허용해줘")).toEqual({ type: "MIC" });
    expect(parse("마이크 권한 설정")).toEqual({ type: "MIC" });
  });

  it("음성 멈춤은 운동 멈춤과 다르다", () => {
    expect(parse("멈춰")).toEqual({ type: "PAUSE" });
  });

  it("운동하기·콘텐츠 올리기·새 콘텐츠·내 강의", () => {
    expect(parse("콘텐츠 올리기")).toEqual({ type: "SUPPLY" });
    expect(parse("내 콘텐츠 보여줘")).toEqual({ type: "SUPPLY" });
    expect(parse("새 콘텐츠 만들래")).toEqual({ type: "NEW_CONTENT" });
    expect(parse("운동하기로 바꿔줘")).toEqual({ type: "CONSUME" });
    expect(parse("내 강의")).toEqual({ type: "COURSES", courseId: null, learned: true });
  });

  it("강의를 말하면 배웠다고 기록하고, '안'이 있으면 뺀다", () => {
    expect(parse("하체 강의 들었어")).toEqual({ type: "COURSES", courseId: "lower", learned: true });
    expect(parse("요가 수강했어")).toEqual({ type: "COURSES", courseId: "stretch", learned: true });
    expect(parse("코어 강의는 안 들었어")).toEqual({ type: "COURSES", courseId: "core", learned: false });
    // 강의라는 말이 없으면 운동 찾기다
    expect(parse("하체 운동 찾아줘")).toEqual({ type: "LIST", category: null, keyword: "하체" });
  });
});
