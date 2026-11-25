import type { PublishedExercise } from "./api";

/**
 * 내가 한 운동 기록 (docs/decisions/0012). 이 브라우저에 사람마다(로그인 전이면 '손님') 남긴다.
 * 운동을 끝까지 하면 기록하고, 다음에 할 운동을 고를 때와 "몇 번째예요"라고 알려 줄 때 쓴다.
 */
export interface HistoryEntry {
  exerciseId: string;
  /** 끝낸 시각 (ms) */
  at: number;
}

const KEY = "yconic.history";
const MAX = 200;

function key(accountId: string | null): string {
  return `${KEY}.${accountId ?? "guest"}`;
}

export function readHistory(accountId: string | null): HistoryEntry[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key(accountId)) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((e): e is HistoryEntry => typeof e?.exerciseId === "string" && typeof e?.at === "number") : [];
  } catch {
    return [];
  }
}

export function recordCompletion(accountId: string | null, exerciseId: string, at = Date.now()): HistoryEntry[] {
  const next = [...readHistory(accountId), { exerciseId, at }].slice(-MAX);
  try {
    window.localStorage.setItem(key(accountId), JSON.stringify(next));
  } catch {
    // 저장하지 못해도 이번 화면에서는 그대로 쓴다
  }
  return next;
}

export function timesDone(history: HistoryEntry[], exerciseId: string): number {
  return history.filter((h) => h.exerciseId === exerciseId).length;
}

/**
 * 방금 마친 운동 다음에 할 운동을 고른다.
 * 1) 덜 해 본 운동부터  2) 같다면 방금 운동과 부위가 다른 것(몸을 고르게)  3) 같다면 짧은 것.
 */
export function recommendNext(
  exercises: readonly Pick<PublishedExercise, "id" | "title" | "category" | "tags" | "video">[],
  currentId: string,
  history: HistoryEntry[],
): (typeof exercises)[number] | null {
  const current = exercises.find((e) => e.id === currentId);
  const candidates = exercises.filter((e) => e.id !== currentId);
  if (candidates.length === 0) return null;
  const samePart = (e: (typeof exercises)[number]) => !!current && (e.category === current.category || e.tags.some((t) => current.tags.includes(t)));
  return [...candidates].sort(
    (a, b) =>
      timesDone(history, a.id) - timesDone(history, b.id) ||
      Number(samePart(a)) - Number(samePart(b)) ||
      a.video.durationSec - b.video.durationSec,
  )[0]!;
}
