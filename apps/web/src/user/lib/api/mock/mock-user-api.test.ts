import { describe, expect, it } from "vitest";
import { validateExerciseContent } from "@yconic/shared-types";
import { UserApiError } from "../user-api";
import { createMockUserApi } from "./mock-user-api";
import { createSeedState } from "@/mock/seed";

const createSeedContents = () => createSeedState(Date.parse("2026-11-10T00:00:00.000Z")).contents;

const api = createMockUserApi(createSeedContents());

describe("모의 사용자 API", () => {
  it("공개 중인 콘텐츠만 돌려준다", async () => {
    const list = await api.listExercises();
    expect(list.map((e) => e.id)).toEqual(["c-neck", "c-squat", "c-wall", "c-march"]);
  });

  it("공개 전 콘텐츠는 주소를 알아도 열 수 없다", async () => {
    await expect(api.getExercise("c2")).rejects.toBeInstanceOf(UserApiError);
    expect(await api.getVideoPlaybackUrl("v2")).toBeNull();
  });

  it("관리자 내부 정보는 넘어오지 않는다", async () => {
    const exercise = await api.getExercise("c-neck");
    expect(Object.keys(exercise).sort()).toEqual(
      ["category", "difficulty", "id", "precautions", "segments", "summary", "tags", "title", "video"].sort(),
    );
    expect(exercise).not.toHaveProperty("internalNote");
    expect(exercise).not.toHaveProperty("reviewComment");
  });

  it("분류와 낱말로 거른다", async () => {
    expect((await api.listExercises({ category: "STRENGTH" })).map((e) => e.id)).toEqual(["c-squat", "c-wall"]);
    expect((await api.listExercises({ keyword: "하체" })).map((e) => e.id)).toEqual(["c-squat"]);
    expect(await api.listExercises({ category: "REHAB" })).toEqual([]);
  });

  it("돌려준 값을 고쳐도 원본은 바뀌지 않는다", async () => {
    const first = await api.getExercise("c-neck");
    first.segments[0]!.voiceGuide = "바뀜";
    first.tags.push("바뀜");
    const second = await api.getExercise("c-neck");
    expect(second.segments[0]!.voiceGuide).not.toBe("바뀜");
    expect(second.tags).not.toContain("바뀜");
  });
});

describe("관리자 화면과 같은 저장소 읽기", () => {
  it("매번 최신 목록을 읽어서, 관리자가 공개한 콘텐츠가 바로 보인다", async () => {
    const contents = createSeedContents();
    const live = createMockUserApi(() => contents, async (id) => (id === "v2" ? "blob:v2" : null));
    expect((await live.listExercises()).map((e) => e.id)).not.toContain("c2");
    contents.find((c) => c.id === "c2")!.status = "PUBLISHED";
    expect((await live.listExercises()).map((e) => e.id)).toContain("c2");
    // 주소가 없는 영상은 브라우저 저장소에서 찾는다
    expect(await live.getVideoPlaybackUrl("v2")).toBe("blob:v2");
  });
});

describe("예시 콘텐츠", () => {
  it("공개 콘텐츠는 공통 검사 규칙에서 오류가 없다", () => {
    for (const content of createSeedContents().filter((c) => c.status === "PUBLISHED")) {
      const errors = validateExerciseContent(content).filter((issue) => issue.severity === "ERROR");
      expect(errors, content.title).toEqual([]);
    }
  });
});

describe("예시 콘텐츠의 음성 안내", () => {
  it("공개 콘텐츠에 시각 의존 표현 경고가 없다", () => {
    for (const content of createSeedContents().filter((c) => c.status === "PUBLISHED")) {
      const warnings = validateExerciseContent(content).filter((issue) => issue.message.includes("시각"));
      expect(warnings, content.title).toEqual([]);
    }
  });
});
