import { describe, expect, it } from "vitest";
import { validateExerciseContent } from "@yconic/shared-types";
import { UserApiError } from "../user-api";
import { createMockUserApi } from "./mock-user-api";
import { createSeedContents } from "./seed";

const api = createMockUserApi(createSeedContents());

describe("모의 사용자 API", () => {
  it("공개 중인 콘텐츠만 돌려준다", async () => {
    const list = await api.listExercises();
    expect(list.map((e) => e.id)).toEqual(["c-neck", "c-squat", "c-wall", "c-march"]);
  });

  it("공개 전 콘텐츠는 주소를 알아도 열 수 없다", async () => {
    await expect(api.getExercise("c-review")).rejects.toBeInstanceOf(UserApiError);
    expect(await api.getVideoPlaybackUrl("v-balance")).toBeNull();
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
