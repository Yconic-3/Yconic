import type { ExerciseSegment, ExerciseSessionState, SegmentKind } from "@yconic/shared-types";

/**
 * 영상(또는 시간) 위치와 구간 사이의 계산.
 * 화면과 떨어진 순수 함수라 테스트로 확인할 수 있다.
 */

type Timed = Pick<ExerciseSegment, "startSec" | "endSec">;

/** 지금 시각에 해당하는 구간 번호(0부터). 첫 구간이 시작되기 전이면 -1 */
export function segmentIndexAt(segments: Timed[], sec: number): number {
  let index = -1;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s && s.startSec <= sec) index = i;
    else break;
  }
  return index;
}

export function clampSegmentIndex(segments: Timed[], index: number): number {
  if (segments.length === 0) return -1;
  return Math.max(0, Math.min(segments.length - 1, index));
}

/** 그 구간으로 옮길 때 맞출 시각 */
export function segmentStartSec(segments: Timed[], index: number): number {
  return segments[clampSegmentIndex(segments, index)]?.startSec ?? 0;
}

/** 재생이 끝나는 시각: 영상 길이와 마지막 구간 끝 중 큰 값 */
export function sessionEndSec(segments: Timed[], videoDurationSec: number): number {
  const lastEnd = segments[segments.length - 1]?.endSec ?? 0;
  return Math.max(videoDurationSec, lastEnd);
}

/**
 * 화면에 보여 줄 운동 세션 상태 (공통 타입의 ExerciseSessionState).
 * 설계상 세션 상태는 백엔드가 관리한다. 백엔드가 준비되기 전까지만 앱이 이 계산으로 대신한다.
 */
export function sessionStateFor(opts: {
  started: boolean;
  playing: boolean;
  readingPrecautions: boolean;
  completed: boolean;
  stopped: boolean;
  kind: SegmentKind | null;
}): ExerciseSessionState {
  if (opts.stopped) return "STOPPED";
  if (opts.completed) return "COMPLETED";
  if (!opts.started) return "READY";
  if (opts.readingPrecautions) return "INTRO";
  if (!opts.playing) return "PAUSED";
  if (opts.kind === "INTRO") return "PREPARATION";
  if (opts.kind === "REST") return "REST";
  return "IN_PROGRESS";
}

export const SESSION_STATE_LABELS: Record<ExerciseSessionState, string> = {
  READY: "준비됨",
  INTRO: "주의사항 안내 중",
  PREPARATION: "준비 자세",
  IN_PROGRESS: "운동 중",
  REST: "휴식 중",
  PAUSED: "멈춤",
  COMPLETED: "완료",
  STOPPED: "중단됨",
};

/** 구간이 시작될 때 읽어 줄 말 */
export function segmentAnnouncement(segment: Pick<ExerciseSegment, "title" | "voiceGuide">, index: number, total: number): string {
  const guide = segment.voiceGuide.trim();
  return `${total}단계 중 ${index + 1}단계, ${segment.title}. ${guide}`.trim();
}

export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}
