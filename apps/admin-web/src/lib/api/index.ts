import type { AdminUser } from "@yconic/shared-types";
import type { AdminApi } from "./admin-api";
import { createHttpAdminApi } from "./http-admin-api";
import { createMockAdminApi } from "./mock/mock-admin-api";
import { createLocalStorageMockStorage } from "./mock/storage";

export type ApiMode = "mock" | "http";

export function getApiMode(): ApiMode {
  return process.env.NEXT_PUBLIC_ADMIN_API_MODE === "http" ? "http" : "mock";
}

/** 환경 변수에 따라 모의 구현 또는 HTTP 구현을 만든다. 화면 코드는 AdminApi 인터페이스만 본다. */
export function createAdminApi(getCurrentUser: () => AdminUser | null): AdminApi {
  if (getApiMode() === "http") {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
    return createHttpAdminApi(base);
  }
  return createMockAdminApi({ storage: createLocalStorageMockStorage(), getCurrentUser });
}

export { AdminApiError, errorMessage } from "./admin-api";
export type { AdminApi } from "./admin-api";
