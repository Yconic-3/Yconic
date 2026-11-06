import type { MockJob, MockState } from "./seed";
import type { MockStorage } from "./mock-admin-api";

// 키 이름은 바꾸지 않는다. 형식이 바뀌면 schemaVersion을 올리고 migrate에서 옮긴다.
const KEY = "yconic.admin.mock-state.v2";

/** 예전 형식으로 저장된 모의 데이터를 현재 형식으로 옮긴다. 옮길 수 없으면 null */
export function migrateMockState(raw: unknown): MockState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as { schemaVersion?: number; jobs?: Partial<MockJob>[] };
  if (s.schemaVersion === 3) return raw as MockState;
  if (s.schemaVersion === 2) {
    // v3: 제작 작업에 kind가 생겼다. 예전 작업은 모두 새 콘텐츠 제작이었다.
    const jobs = (s.jobs ?? []).map((j) => ({ ...j, kind: j.kind ?? "CREATE" }));
    return { ...(raw as object), jobs, schemaVersion: 3 } as MockState;
  }
  return null;
}

/** 브라우저 localStorage에 모의 데이터를 보관한다. 새로 고쳐도 유지된다. */
export function createLocalStorageMockStorage(): MockStorage {
  return {
    load() {
      try {
        if (typeof window === "undefined") return null;
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return null;
        return migrateMockState(JSON.parse(raw));
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
