import type { MockState } from "./seed";
import type { MockStorage } from "./mock-admin-api";

const KEY = "yconic.admin.mock-state.v1";

/** 브라우저 localStorage에 모의 데이터를 보관한다. 새로 고쳐도 유지된다. */
export function createLocalStorageMockStorage(): MockStorage {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as MockState;
        return parsed.schemaVersion === 1 ? parsed : null;
      } catch {
        return null;
      }
    },
    save(state) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        // 저장 공간이 없거나 차단된 환경에서는 메모리에만 유지한다.
      }
    },
  };
}

export function createMemoryMockStorage(initial: MockState | null = null): MockStorage {
  let current = initial;
  return {
    load: () => current,
    save: (s) => {
      current = structuredClone(s);
    },
  };
}

export function resetMockStorage() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
