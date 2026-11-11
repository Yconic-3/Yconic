import { createSeedState } from "@/mock/seed";
import { createLocalStorageMockStorage } from "@/mock/storage";
import { createIndexedDbVideoStore } from "@/mock/video-store";
import { createHttpUserApi } from "./http-user-api";
import { createMockUserApi } from "./mock/mock-user-api";
import type { UserApi } from "./user-api";

export type ApiMode = "mock" | "http";

export function getApiMode(): ApiMode {
  return process.env.NEXT_PUBLIC_USER_API_MODE === "http" ? "http" : "mock";
}

/**
 * 환경 변수에 따라 모의 구현 또는 HTTP 구현을 만든다. 화면 코드는 UserApi 인터페이스만 본다.
 * 모의 모드에서는 관리자 화면(/admin)과 같은 브라우저 저장소를 읽는다.
 * 그래서 관리자가 영상을 올려 공개하면 사용자 화면에 바로 나온다.
 */
export function createUserApi(): UserApi {
  if (getApiMode() === "http") {
    return createHttpUserApi(process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");
  }
  const storage = createLocalStorageMockStorage();
  const videoStore = createIndexedDbVideoStore();
  // 관리자 화면을 한 번도 열지 않았으면 저장된 상태가 없다. 그때는 관리자 화면과 같은 처음 상태를 쓴다.
  const seed = createSeedState(Date.now());
  return createMockUserApi(
    () => storage.load()?.contents ?? seed.contents,
    (videoId) => videoStore.getPlaybackUrl(videoId),
  );
}

export { errorMessage, UserApiError } from "./user-api";
export type { ExerciseListFilter, PublishedExercise, UserApi } from "./user-api";
