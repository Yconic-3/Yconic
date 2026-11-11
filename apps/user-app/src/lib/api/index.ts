import { createHttpUserApi } from "./http-user-api";
import { createMockUserApi } from "./mock/mock-user-api";
import { createSeedContents } from "./mock/seed";
import type { UserApi } from "./user-api";

export type ApiMode = "mock" | "http";

export function getApiMode(): ApiMode {
  return process.env.NEXT_PUBLIC_USER_API_MODE === "http" ? "http" : "mock";
}

/** 환경 변수에 따라 모의 구현 또는 HTTP 구현을 만든다. 화면 코드는 UserApi 인터페이스만 본다. */
export function createUserApi(): UserApi {
  if (getApiMode() === "http") {
    return createHttpUserApi(process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");
  }
  return createMockUserApi(createSeedContents());
}

export { errorMessage, UserApiError } from "./user-api";
export type { ExerciseListFilter, PublishedExercise, UserApi } from "./user-api";
