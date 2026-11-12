import {
  LEARNED_COURSES,
  isMovementId,
  movementLabel,
  ruleGuideText,
  segmentGuideLevel,
  type AdminApiErrorBody,
  type CourseId,
  type LearningProfile,
  type MovementId,
  type MovementKnowledge,
  type PersonalizedGuides,
  type SetMovementInput,
} from "@yconic/shared-types";
import { API_UNREACHABLE_MESSAGE, apiBaseUrl, getApiMode } from "@/lib/api-mode";
import { getAuthToken, readSignedInAccount } from "@/lib/auth";
import type { PublishedExercise } from "./api";

/**
 * 내 동작(학습 프로필)과 맞춤 안내 (shared-types/movements.ts, docs/decisions/0008).
 * 서버 모드는 /me/learning, /me/guides를 쓰고 AI가 사용자에 맞게 다시 쓴 안내를 받는다.
 * 모의 모드는 이 브라우저 저장소에 계정별로 두고, 미리 만든 두 안내(자세한·짧은) 중에서 고른다.
 */
export interface LearningApi {
  getProfile(): Promise<LearningProfile>;
  setMovement(movementId: MovementId, input: SetMovementInput): Promise<LearningProfile>;
  /** 끝까지 따라 한 동작을 알린다 (세 번이면 아는 동작이 된다) */
  recordPractice(movementIds: MovementId[]): Promise<LearningProfile>;
  getGuides(exercise: PublishedExercise): Promise<PersonalizedGuides>;
}

function createHttpLearningApi(baseUrl: string): LearningApi {
  async function call<T>(method: "GET" | "PUT" | "POST", path: string, body?: unknown): Promise<T> {
    const token = getAuthToken();
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
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
    return (await res.json()) as T;
  }
  return {
    getProfile: () => call("GET", "/me/learning"),
    setMovement: (id, input) => call("PUT", `/me/learning/movements/${id}`, input),
    recordPractice: (movementIds) => call("POST", "/me/learning/practice", { movementIds }),
    getGuides: (exercise) => call("GET", `/me/guides/${exercise.id}`),
  };
}

const MOCK_KEY = "yconic.mock-learning";
const MOCK_COURSES_KEY = "yconic.mock-courses";

interface MockEntry {
  declared: boolean;
  practiceCount: number;
  terms: string;
}

function createMockLearningApi(): LearningApi {
  function accountId(): string {
    const a = readSignedInAccount();
    if (!a) throw new Error("로그인이 필요합니다.");
    return a.id;
  }
  function read(): Record<string, MockEntry> {
    try {
      const raw = JSON.parse(window.localStorage.getItem(`${MOCK_KEY}.${accountId()}`) ?? "{}") as Record<string, MockEntry>;
      return Object.fromEntries(Object.entries(raw).filter(([id]) => isMovementId(id)));
    } catch {
      return {};
    }
  }
  function write(entries: Record<string, MockEntry>) {
    window.localStorage.setItem(`${MOCK_KEY}.${accountId()}`, JSON.stringify(entries));
  }
  function courses(): CourseId[] {
    try {
      return JSON.parse(window.localStorage.getItem(`${MOCK_COURSES_KEY}.${accountId()}`) ?? "[]") as CourseId[];
    } catch {
      return [];
    }
  }
  function profile(): LearningProfile {
    const entries = read();
    const fromCourses = new Set(LEARNED_COURSES.filter((c) => courses().includes(c.id)).flatMap((c) => c.movements));
    const ids = new Set<MovementId>([...fromCourses, ...(Object.keys(entries) as MovementId[])]);
    const movements: MovementKnowledge[] = [...ids].map((movementId) => {
      const e = entries[movementId];
      const sources: MovementKnowledge["sources"] = [];
      if (fromCourses.has(movementId)) sources.push("course");
      if (e?.declared) sources.push("said");
      if ((e?.practiceCount ?? 0) > 0) sources.push("practice");
      return { movementId, declared: fromCourses.has(movementId) || !!e?.declared, sources, practiceCount: e?.practiceCount ?? 0, terms: e?.terms ?? "" };
    });
    return { movements: movements.filter((m) => m.declared || m.practiceCount > 0) };
  }
  return {
    async getProfile() {
      return profile();
    },
    async setMovement(id, input) {
      const entries = read();
      const prev = entries[id] ?? { declared: false, practiceCount: 0, terms: "" };
      entries[id] = { declared: input.known, practiceCount: prev.practiceCount, terms: input.terms ?? prev.terms };
      write(entries);
      return profile();
    },
    async recordPractice(movementIds) {
      const entries = read();
      for (const id of new Set(movementIds)) {
        const prev = entries[id] ?? { declared: false, practiceCount: 0, terms: "" };
        entries[id] = { ...prev, practiceCount: prev.practiceCount + 1 };
      }
      write(entries);
      return profile();
    },
    async getGuides(exercise) {
      const p = profile();
      return { exerciseId: exercise.id, generatedBy: "rule", segments: exercise.segments.map((s) => ruleGuide(s, p)) };
    },
  };
}

/** 규칙으로 고른 단계 안내와 그 이유 (서버가 AI를 쓸 수 없을 때와 같은 규칙) */
export function ruleGuide(s: PublishedExercise["segments"][number], profile: LearningProfile | null) {
  const level = segmentGuideLevel(s, profile);
  const names = (s.movements ?? []).map(movementLabel).join("·");
  const reason = !names ? "" : level === "concise" ? `${names}: 배운 동작이라 짧게` : `${names}: 처음 하는 동작이라 자세히`;
  return { segmentId: s.id, level, text: ruleGuideText(s, profile), reason };
}

export function createLearningApi(): LearningApi {
  return getApiMode() === "http" ? createHttpLearningApi(apiBaseUrl()) : createMockLearningApi();
}
