import { describe, expect, it } from "vitest";
import { searchExercises, searchPath, searchTerms, type Searchable } from "./search";

const list: Searchable[] = [
  { id: "c-neck", title: "앉아서 하는 목 스트레칭", summary: "의자에 앉아 목 옆 근육을 늘린다", tags: ["목", "앉아서"], category: "STRETCHING", difficulty: "BEGINNER" },
  { id: "c-squat", title: "의자 잡고 스쿼트", summary: "의자 등받이를 잡고 하는 하체 근력 운동", tags: ["하체", "의자"], category: "STRENGTH", difficulty: "BEGINNER" },
  { id: "c-wall", title: "벽 밀기 상체 운동", summary: "벽을 밀어 팔과 가슴을 쓴다", tags: ["상체", "벽"], category: "STRENGTH", difficulty: "BEGINNER" },
  { id: "c-march", title: "제자리 걷기", summary: "제자리에서 걷는 유산소 운동", tags: ["걷기", "전신"], category: "CARDIO", difficulty: "BEGINNER" },
];
const ids = (q: string) => searchExercises(list, q).map((e) => e.id);

describe("검색어 나누기", () => {
  it("'찾아줘', '운동' 같은 말과 조사는 뺀다", () => {
    expect(searchTerms("하체 운동 찾아줘")).toEqual(["하체"]);
    expect(searchTerms("의자를 쓰는 운동 보여줘")).toEqual(["의자", "쓰는"]);
    expect(searchTerms("운동 찾아줘")).toEqual([]);
  });
});

describe("영상 검색", () => {
  it("꼬리표·분류·요약에서 찾는다", () => {
    expect(ids("하체")).toEqual(["c-squat"]);
    expect(ids("스트레칭")).toEqual(["c-neck"]);
    expect(ids("근력 운동")).toEqual(["c-squat", "c-wall"]);
    expect(ids("유산소")).toEqual(["c-march"]);
  });

  it("제목에 맞는 것을 앞에 둔다", () => {
    // '의자'는 스쿼트 제목, 목 스트레칭 요약에 있다
    expect(ids("의자")).toEqual(["c-squat", "c-neck"]);
  });

  it("띄어쓰기가 달라도 찾는다", () => {
    expect(ids("목스트레칭")).toEqual(["c-neck"]);
  });

  it("남는 낱말이 없으면 전부, 맞는 것이 없으면 빈 목록", () => {
    expect(ids("운동 찾아줘")).toHaveLength(4);
    expect(ids("수영")).toEqual([]);
  });

  it("검색 주소를 만든다", () => {
    expect(searchPath(" 하체 운동 ")).toBe("/search?q=%ED%95%98%EC%B2%B4%20%EC%9A%B4%EB%8F%99");
  });
});
