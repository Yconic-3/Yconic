import type { ExerciseSegment, NarrationLine } from "./exercise";
import { SPEECH_CHARS_PER_SEC } from "./validation";

/**
 * 영상 속 강사의 말과 앱의 음성 안내가 겹치지 않게 하는 규칙 (docs/decisions/0009).
 * - 음성 안내를 켜면(시각장애인용): 강사가 말하는 동안은 영상 소리를 끄고, 앱이 그 사람에 맞게 다시 쓴 안내를 대신 읽는다.
 *   앱이 말하는 동안에도 영상 소리를 끈다. 강사가 말하지 않는 부분(음악, 박자 소리)은 그대로 들린다.
 * - 음성 안내를 끄면(일반 사용자): 원래 영상을 그대로 들려준다.
 */

/** 강사 말의 앞뒤로 조금 더 소리를 끈다 (말 끝이 새어 나오지 않게) */
export const NARRATION_PAD_SEC = 0.3;

/** 받아 적은 말 한 줄을 그 말이 끝나기 전에 시작한 단계에 나눠 담는다 (말의 가운데 시각이 속한 단계) */
export function attachNarration<T extends Pick<ExerciseSegment, "startSec" | "endSec">>(
  segments: T[],
  lines: readonly NarrationLine[],
): (T & { narration: NarrationLine[] })[] {
  return segments.map((s, i) => {
    const last = i === segments.length - 1;
    const narration = lines.filter((l) => {
      const mid = (l.startSec + l.endSec) / 2;
      return mid >= s.startSec && (mid < s.endSec || (last && mid <= s.endSec + 1));
    });
    return { ...s, narration };
  });
}

/** 이 시각에 영상 속 강사가 말하고 있는지 */
export function isNarrationAt(segments: readonly Pick<ExerciseSegment, "narration">[], sec: number, padSec = NARRATION_PAD_SEC): boolean {
  return segments.some((s) => (s.narration ?? []).some((l) => sec >= l.startSec - padSec && sec <= l.endSec + padSec));
}

/** 강사의 말이 들어 있는 영상인지 */
export function hasNarration(segments: readonly Pick<ExerciseSegment, "narration">[]): boolean {
  return segments.some((s) => (s.narration ?? []).length > 0);
}

/** 단계 안에 말해야 할 글자 수 (1초에 4글자, 끝에 여유를 둔다) */
export function speechBudgetChars(seconds: number): number {
  return Math.max(12, Math.floor(seconds * SPEECH_CHARS_PER_SEC * 0.9));
}

/**
 * 안내를 이 단계 안에 다 읽을 수 있게 말 속도를 맞춘다 (영상 속도에 맞추기).
 * 사용자가 고른 속도(baseRate)보다 느리게 하지는 않고, 너무 빨라지지 않게 maxRate에서 멈춘다.
 */
export function fitSpeechRate(text: string, seconds: number, baseRate = 1, maxRate = 1.6): number {
  if (seconds <= 0) return baseRate;
  const needSec = text.trim().length / SPEECH_CHARS_PER_SEC / baseRate;
  const room = seconds * 0.95;
  if (needSec <= room) return baseRate;
  return Math.round(Math.min(maxRate, Math.max(baseRate, (baseRate * needSec) / room)) * 100) / 100;
}
