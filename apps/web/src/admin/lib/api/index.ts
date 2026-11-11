import type { AdminUser } from "@yconic/shared-types";
import { readVideoMetadata } from "../video";
import type { AdminApi } from "./admin-api";
import { createHttpAdminApi } from "./http-admin-api";
import { createMockAdminApi } from "@/mock/mock-admin-api";
import { createLocalStorageMockStorage } from "@/mock/storage";
import { createIndexedDbVideoStore } from "@/mock/video-store";
import { apiBaseUrl, getApiMode } from "@/lib/api-mode";
import { getAuthToken } from "@/lib/auth";

export { getApiMode, type ApiMode } from "@/lib/api-mode";

/** 환경 변수에 따라 모의 구현 또는 HTTP 구현을 만든다. 화면 코드는 AdminApi 인터페이스만 본다. */
export function createAdminApi(getCurrentUser: () => AdminUser | null): AdminApi {
  if (getApiMode() === "http") {
    return createHttpAdminApi(apiBaseUrl(), getAuthToken, readVideoMetadata);
  }
  return createMockAdminApi({
    storage: createLocalStorageMockStorage(),
    videoStore: createIndexedDbVideoStore(),
    readVideoMetadata,
    getCurrentUser,
  });
}

export { AdminApiError, errorMessage } from "./admin-api";
export type { AdminApi } from "./admin-api";
