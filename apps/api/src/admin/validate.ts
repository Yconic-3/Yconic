import {
  CONTENT_ACTIONS,
  CONTENT_STATUSES,
  DIFFICULTIES,
  EXERCISE_CATEGORIES,
  LEARNED_COURSE_IDS,
  MOVEMENT_IDS,
  SEGMENT_KINDS,
  type ChangeContentStatusInput,
  type ContentListFilter,
  type CreateContentJobInput,
  type ExerciseSegment,
  type MovementId,
  type MyCourses,
  type ReanalyzeContentInput,
  type ReplaceContentVideoInput,
  type RequestTtsInput,
  type SubmitMyContentInput,
  type UpdateExerciseContentInput,
  type UpdateMyGuidesInput,
} from "@yconic/shared-types";
import { ApiError } from "../common/errors";

/**
 * 요청 본문 검사. 브라우저가 보낸 값은 믿지 않고 모양을 확인한다.
 * 틀리면 400(VALIDATION)으로 거절한다.
 */

function fail(message: string): never {
  throw new ApiError("VALIDATION", message);
}

function obj(v: unknown, what = "요청"): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(`${what} 형식이 올바르지 않습니다.`);
  return v as Record<string, unknown>;
}

function str(v: unknown, field: string, { max = 5000 }: { max?: number } = {}): string {
  if (typeof v !== "string") fail(`${field}은(는) 글자여야 합니다.`);
  if (v.length > max) fail(`${field}이(가) 너무 깁니다 (최대 ${max}자).`);
  return v;
}

function num(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${field}은(는) 숫자여야 합니다.`);
  return v;
}

function int(v: unknown, field: string): number {
  const n = num(v, field);
  if (!Number.isInteger(n)) fail(`${field}은(는) 정수여야 합니다.`);
  return n;
}

function oneOf<T extends string>(v: unknown, list: readonly T[], field: string): T {
  if (typeof v !== "string" || !list.includes(v as T)) fail(`${field} 값이 올바르지 않습니다.`);
  return v as T;
}

function strList(v: unknown, field: string, maxItems = 50): string[] {
  if (!Array.isArray(v)) fail(`${field}은(는) 목록이어야 합니다.`);
  if (v.length > maxItems) fail(`${field}이(가) 너무 많습니다 (최대 ${maxItems}개).`);
  return v.map((x, i) => str(x, `${field} ${i + 1}번째`, { max: 500 }));
}

function movementList(v: unknown, field: string): MovementId[] {
  if (!Array.isArray(v)) fail(`${field}은(는) 목록이어야 합니다.`);
  return [...new Set(v.map((m) => oneOf(m, MOVEMENT_IDS, field)))];
}

/** 구간. 음성(tts) 칸은 서버가 관리하므로 읽지 않는다. */
export type SegmentInput = Omit<ExerciseSegment, "tts" | "order">;

function segment(v: unknown, i: number): SegmentInput {
  const s = obj(v, `${i + 1}구간`);
  const label = `${i + 1}구간`;
  return {
    id: str(s.id, `${label} ID`, { max: 100 }),
    kind: oneOf(s.kind, SEGMENT_KINDS, `${label} 종류`),
    startSec: num(s.startSec, `${label} 시작 시각`),
    endSec: num(s.endSec, `${label} 끝 시각`),
    title: str(s.title, `${label} 제목`, { max: 200 }),
    instruction: str(s.instruction ?? "", `${label} 동작 설명`, { max: 2000 }),
    voiceGuide: str(s.voiceGuide, `${label} 음성 안내문`, { max: 2000 }),
    conciseGuide: str(s.conciseGuide ?? "", `${label} 짧은 안내문`, { max: 1000 }),
    // 동작은 보내지 않으면 서버가 원래 값을 지킨다 (admin.service segmentRow)
    movements: s.movements === undefined ? undefined : movementList(s.movements, `${label} 동작`),
    repetitions: s.repetitions === null || s.repetitions === undefined ? null : int(s.repetitions, `${label} 반복 횟수`),
  };
}

export type UpdateContentBody = Omit<UpdateExerciseContentInput, "segments"> & { segments: SegmentInput[] };

export function parseUpdateContent(body: unknown): UpdateContentBody {
  const b = obj(body);
  if (!Array.isArray(b.segments)) fail("구간 목록이 필요합니다.");
  if (b.segments.length > 200) fail("구간이 너무 많습니다 (최대 200개).");
  return {
    title: str(b.title, "제목", { max: 200 }),
    summary: str(b.summary, "요약", { max: 2000 }),
    category: oneOf(b.category, EXERCISE_CATEGORIES, "분류"),
    difficulty: oneOf(b.difficulty, DIFFICULTIES, "난이도"),
    tags: strList(b.tags, "태그"),
    precautions: strList(b.precautions, "주의사항"),
    internalNote: str(b.internalNote ?? "", "내부 메모", { max: 5000 }),
    segments: b.segments.map(segment),
    expectedVersion: int(b.expectedVersion, "버전"),
  };
}

export function parseChangeStatus(body: unknown): ChangeContentStatusInput {
  const b = obj(body);
  return {
    action: oneOf(b.action, CONTENT_ACTIONS, "작업"),
    comment: b.comment === undefined || b.comment === null ? undefined : str(b.comment, "검수 의견", { max: 2000 }),
  };
}

export function parseRequestTts(body: unknown): RequestTtsInput {
  const b = obj(body);
  if (!Array.isArray(b.segmentIds)) fail("음성을 만들 구간 목록이 필요합니다.");
  return { segmentIds: b.segmentIds.map((x, i) => str(x, `구간 ${i + 1}`, { max: 100 })) };
}

export function parseCreateJob(body: unknown): CreateContentJobInput {
  const b = obj(body);
  return {
    videoId: str(b.videoId, "영상", { max: 100 }),
    title: str(b.title, "운동 이름", { max: 200 }),
    category: oneOf(b.category, EXERCISE_CATEGORIES, "분류"),
    difficulty: oneOf(b.difficulty, DIFFICULTIES, "난이도"),
    requestNote: str(b.requestNote ?? "", "요청 사항", { max: 2000 }),
  };
}

export function parseReplaceVideo(body: unknown): ReplaceContentVideoInput {
  const b = obj(body);
  return { videoId: str(b.videoId, "영상", { max: 100 }), expectedVersion: int(b.expectedVersion, "버전") };
}

export function parseReanalyze(body: unknown): ReanalyzeContentInput {
  const b = obj(body);
  return { requestNote: str(b.requestNote ?? "", "요청 사항", { max: 2000 }), expectedVersion: int(b.expectedVersion, "버전") };
}

export function parseListFilter(q: Record<string, unknown>): ContentListFilter {
  return {
    status: q.status ? oneOf(q.status, CONTENT_STATUSES, "상태") : undefined,
    query: typeof q.query === "string" && q.query.trim() ? q.query.trim().slice(0, 100) : undefined,
  };
}

/** 업로드 양식의 영상 정보 (브라우저가 영상에서 읽어 함께 보낸다) */
export function parseVideoMeta(body: Record<string, unknown>): { durationSec: number; width: number; height: number } {
  const n = (v: unknown, field: string) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x < 0) fail(`${field} 값이 올바르지 않습니다.`);
    return x;
  };
  const durationSec = n(body.durationSec, "영상 길이");
  if (!(durationSec > 0)) fail("영상 길이를 읽을 수 없습니다.");
  return { durationSec, width: Math.round(n(body.width ?? 0, "가로 크기")), height: Math.round(n(body.height ?? 0, "세로 크기")) };
}

// ── 회원 콘텐츠 올리기 (/me) ──

export function parseUpdateMyGuides(body: unknown): UpdateMyGuidesInput {
  const b = obj(body);
  if (!Array.isArray(b.segments)) fail("segments는 목록이어야 합니다.");
  if (b.segments.length > 200) fail("단계가 너무 많습니다.");
  return {
    expectedVersion: int(b.expectedVersion, "expectedVersion"),
    segments: b.segments.map((s, i) => {
      const o = obj(s, `${i + 1}단계`);
      return { id: str(o.id, `${i + 1}단계 id`, { max: 100 }), voiceGuide: str(o.voiceGuide, `${i + 1}단계 음성 안내`, { max: 2000 }) };
    }),
  };
}

export function parseMyCourses(body: unknown): MyCourses {
  const b = obj(body);
  if (!Array.isArray(b.courseIds)) fail("courseIds는 목록이어야 합니다.");
  return { courseIds: [...new Set(b.courseIds.map((c) => oneOf(c, LEARNED_COURSE_IDS, "강의")))] };
}

export function parseSubmitMy(body: unknown): SubmitMyContentInput {
  const b = obj(body);
  if (typeof b.confirmed !== "boolean") fail("confirmed는 참·거짓이어야 합니다.");
  return { expectedVersion: int(b.expectedVersion, "expectedVersion"), confirmed: b.confirmed };
}

export function parseSetMovement(movementId: string, body: unknown): { movementId: MovementId; known: boolean; terms?: string } {
  const b = obj(body);
  if (typeof b.known !== "boolean") fail("known은 참·거짓이어야 합니다.");
  return {
    movementId: oneOf(movementId, MOVEMENT_IDS, "동작"),
    known: b.known,
    terms: b.terms === undefined ? undefined : str(b.terms, "배운 용어", { max: 300 }),
  };
}

export function parseRecordPractice(body: unknown): { movementIds: MovementId[] } {
  const b = obj(body);
  return { movementIds: movementList(b.movementIds, "동작").slice(0, 20) };
}
