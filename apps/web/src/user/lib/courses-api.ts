import { LEARNED_COURSE_IDS, type AdminApiErrorBody, type CourseId, type MyCourses } from "@yconic/shared-types";
import { API_UNREACHABLE_MESSAGE, apiBaseUrl, getApiMode } from "@/lib/api-mode";
import { getAuthToken, readSignedInAccount } from "@/lib/auth";

/**
 * 내 강의 읽기·저장 (shared-types/courses.ts).
 * 서버 모드는 GET/PUT /me/courses, 모의 모드는 이 브라우저 저장소에 계정별로 둔다.
 */
export interface CoursesApi {
  get(): Promise<CourseId[]>;
  set(courseIds: CourseId[]): Promise<CourseId[]>;
}

function createHttpCoursesApi(baseUrl: string): CoursesApi {
  async function call(method: "GET" | "PUT", body?: MyCourses): Promise<CourseId[]> {
    const token = getAuthToken();
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/me/courses`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(API_UNREACHABLE_MESSAGE);
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as AdminApiErrorBody | null;
      throw new Error(err?.message ?? `요청 실패 (${res.status})`);
    }
    return ((await res.json()) as MyCourses).courseIds;
  }
  return { get: () => call("GET"), set: (courseIds) => call("PUT", { courseIds }) };
}

const MOCK_KEY = "yconic.mock-courses";

function createMockCoursesApi(): CoursesApi {
  function key(): string {
    const a = readSignedInAccount();
    if (!a) throw new Error("로그인이 필요합니다.");
    return `${MOCK_KEY}.${a.id}`;
  }
  const valid = (v: unknown): CourseId[] =>
    Array.isArray(v) ? v.filter((c): c is CourseId => (LEARNED_COURSE_IDS as readonly unknown[]).includes(c)) : [];
  return {
    async get() {
      try {
        return valid(JSON.parse(window.localStorage.getItem(key()) ?? "[]"));
      } catch {
        return [];
      }
    },
    async set(courseIds) {
      const ids = [...new Set(valid(courseIds))];
      window.localStorage.setItem(key(), JSON.stringify(ids));
      return ids;
    },
  };
}

export function createCoursesApi(): CoursesApi {
  return getApiMode() === "http" ? createHttpCoursesApi(apiBaseUrl()) : createMockCoursesApi();
}
