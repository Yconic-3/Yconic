import type { PublishedExercise } from "@yconic/shared-types";

/**
 * 에이전트가 보는 백엔드. 백엔드 API(apps/api)의 사용자 API만 부른다.
 * 공개 중인 운동만 받으므로, 승인 전 콘텐츠나 관리자 메모는 에이전트에게 오지 않는다.
 * 데이터베이스는 직접 만지지 않는다 (설계 문서 1장).
 * 나중에 backend-mcp가 생기면 이 부분을 MCP 도구 호출로 바꾼다.
 */
export interface Backend {
  /** 공개 중인 운동 전체 */
  listExercises(): Promise<PublishedExercise[]>;
}

export class BackendUnavailableError extends Error {
  constructor(cause: unknown) {
    super("백엔드 API에 연결하지 못했습니다.", { cause });
    this.name = "BackendUnavailableError";
  }
}

/** 목록을 잠깐 기억해, 한 번의 대화에서 여러 번 부르지 않게 한다 */
const CACHE_MS = 15_000;

export function createHttpBackend(baseUrl: string, fetchFn: typeof fetch = fetch): Backend {
  let cached: { at: number; list: PublishedExercise[] } | null = null;
  return {
    async listExercises() {
      if (cached && Date.now() - cached.at < CACHE_MS) return cached.list;
      let res: Response;
      try {
        res = await fetchFn(`${baseUrl}/exercises`, { signal: AbortSignal.timeout(10_000) });
      } catch (e) {
        throw new BackendUnavailableError(e);
      }
      if (!res.ok) throw new BackendUnavailableError(new Error(`GET /exercises → ${res.status}`));
      const list = (await res.json()) as PublishedExercise[];
      cached = { at: Date.now(), list };
      return list;
    },
  };
}
