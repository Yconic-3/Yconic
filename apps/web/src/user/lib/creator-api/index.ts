import { apiBaseUrl, getApiMode } from "@/lib/api-mode";
import { getAuthToken, readSignedInAccount } from "@/lib/auth";
import { readVideoMetadata } from "@/lib/video-file";
import { createMockAdminApi } from "@/mock/mock-admin-api";
import { createLocalStorageMockStorage } from "@/mock/storage";
import { createIndexedDbVideoStore } from "@/mock/video-store";
import type { CreatorApi } from "./creator-api";
import { createHttpCreatorApi } from "./http-creator-api";
import { createMockCreatorApi } from "./mock-creator-api";

/** 환경 변수에 따라 서버(HTTP) 구현 또는 모의 구현을 만든다 */
export function createCreatorApi(): CreatorApi {
  if (getApiMode() === "http") return createHttpCreatorApi(apiBaseUrl(), getAuthToken, readVideoMetadata);
  const backend = createMockAdminApi({
    storage: createLocalStorageMockStorage(),
    videoStore: createIndexedDbVideoStore(),
    readVideoMetadata,
    // 모의 백엔드는 관리자 역할로만 동작한다. 회원을 편집자로 대신 세운다 (mock-creator-api.ts 참고)
    getCurrentUser: () => {
      const a = readSignedInAccount();
      return a ? { id: a.id, name: a.name, email: a.email, role: a.adminRole ?? "EDITOR" } : null;
    },
  });
  return createMockCreatorApi(backend, readSignedInAccount);
}

export { CreatorApiError, creatorErrorMessage } from "./creator-api";
export type { CreatorApi } from "./creator-api";
