import type { ExerciseSegment, TtsAsset } from "@yconic/shared-types";

/** 구간의 최소 길이 (초) */
export const MIN_SEGMENT_SEC = 0.5;
/** 두 구간이 맞닿아 있다고 보는 오차 (초) */
const TOUCH_EPS = 0.05;

const NO_TTS: TtsAsset = { status: "NONE", audioUrl: null, generatedForText: null, failureReason: null };

export function round1(sec: number): number {
  return Math.round(sec * 10) / 10;
}

export function renumber(segments: ExerciseSegment[]): ExerciseSegment[] {
  return segments.map((s, i) => ({ ...s, order: i + 1 }));
}

/**
 * 타임라인에서 끌 수 있는 경계.
 * left: 이 경계가 끝인 구간 번호, right: 이 경계가 시작인 구간 번호.
 * 두 구간이 맞닿아 있으면 경계 하나가 양쪽을 함께 움직인다.
 */
export interface Boundary {
  key: string;
  sec: number;
  left: number | null;
  right: number | null;
}

export function buildBoundaries(segments: ExerciseSegment[]): Boundary[] {
  const out: Boundary[] = [];
  segments.forEach((s, i) => {
    const prev = segments[i - 1];
    const touchesPrev = prev && Math.abs(prev.endSec - s.startSec) < TOUCH_EPS;
    if (!touchesPrev) out.push({ key: `s-${s.id}`, sec: s.startSec, left: null, right: i });
    const next = segments[i + 1];
    const touchesNext = next && Math.abs(s.endSec - next.startSec) < TOUCH_EPS;
    out.push({ key: touchesNext ? `m-${s.id}` : `e-${s.id}`, sec: s.endSec, left: i, right: touchesNext ? i + 1 : null });
  });
  return out;
}

/** 경계가 움직일 수 있는 범위 */
export function boundaryLimits(segments: ExerciseSegment[], b: Boundary, durationSec: number): { min: number; max: number } {
  let min = 0;
  let max = durationSec;
  if (b.left !== null) {
    min = Math.max(min, segments[b.left]!.startSec + MIN_SEGMENT_SEC);
    const next = segments[b.left + 1];
    if (b.right === null && next) max = Math.min(max, next.startSec);
  }
  if (b.right !== null) {
    max = Math.min(max, segments[b.right]!.endSec - MIN_SEGMENT_SEC);
    const prev = segments[b.right - 1];
    if (b.left === null && prev) min = Math.max(min, prev.endSec);
  }
  return { min, max };
}

/** 경계를 sec로 옮긴 새 구간 목록. 범위를 넘으면 범위 끝에 붙인다. 움직일 수 없으면 그대로 돌려준다. */
export function moveBoundary(segments: ExerciseSegment[], b: Boundary, sec: number, durationSec: number): ExerciseSegment[] {
  const { min, max } = boundaryLimits(segments, b, durationSec);
  if (min > max) return segments;
  const t = round1(Math.min(max, Math.max(min, sec)));
  return segments.map((s, i) => {
    if (i === b.left && i === b.right) return s;
    if (i === b.left) return { ...s, endSec: t };
    if (i === b.right) return { ...s, startSec: t };
    return s;
  });
}

/** t 시각에서 구간을 둘로 나눈다. 나눌 수 없는 위치면 null */
export function splitSegmentAt(segments: ExerciseSegment[], index: number, t: number, newId: () => string): ExerciseSegment[] | null {
  const s = segments[index];
  if (!s) return null;
  const at = round1(t);
  if (at < s.startSec + MIN_SEGMENT_SEC || at > s.endSec - MIN_SEGMENT_SEC) return null;
  const first = { ...s, endSec: at };
  const second: ExerciseSegment = { ...s, id: newId(), startSec: at, title: s.title ? `${s.title} (2)` : "", tts: NO_TTS };
  return renumber([...segments.slice(0, index), first, second, ...segments.slice(index + 1)]);
}

export function segmentIndexAt(segments: ExerciseSegment[], t: number): number {
  return segments.findIndex((s) => t >= s.startSec && t < s.endSec);
}

/** t보다 뒤에서 시작하는 첫 구간 */
export function nextSegmentStart(segments: ExerciseSegment[], t: number): number | null {
  const starts = segments.map((s) => s.startSec).filter((x) => x > t + 0.05).sort((a, b) => a - b);
  return starts[0] ?? null;
}

/** 지금 구간 시작에서 1초 넘게 지났으면 지금 구간 시작, 아니면 이전 구간 시작 */
export function previousSegmentStart(segments: ExerciseSegment[], t: number): number {
  const starts = segments.map((s) => s.startSec).sort((a, b) => a - b);
  const before = starts.filter((x) => x < t - 1);
  return before[before.length - 1] ?? 0;
}
