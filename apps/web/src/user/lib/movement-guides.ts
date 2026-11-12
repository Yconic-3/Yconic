import { knowsMovement, movementLabel, type GuideLevel, type LearningProfile, type MovementId } from "@yconic/shared-types";
import type { PublishedExercise } from "./api";
import { eunNeun } from "./korean";

/**
 * 동작 단위 맞춤 안내를 화면에 보여 주기 위한 계산 (docs/decisions/0008).
 * 실제 단계별 글은 서버(AI) 또는 learning-api의 규칙이 정하고, 여기서는 요약만 만든다.
 */

/** 이 영상에 나오는 동작 (나온 순서대로, 겹치지 않게) */
export function practicedMovements(e: Pick<PublishedExercise, "segments">): MovementId[] {
  return [...new Set(e.segments.flatMap((s) => s.movements ?? []))];
}

/** 영상 전체의 안내 수준: 영상 속 동작을 모두 알면 짧게, 하나라도 처음이면 자세하게 */
export function exerciseGuideLevel(e: Pick<PublishedExercise, "segments">, profile: LearningProfile | null): GuideLevel {
  const ms = practicedMovements(e);
  if (!profile || ms.length === 0) return "detailed";
  return ms.every((m) => knowsMovement(profile, m)) ? "concise" : "detailed";
}

/** 운동을 열 때 왜 짧게/자세하게 안내하는지 알리는 한 문장 */
export function guideIntro(e: Pick<PublishedExercise, "segments">, profile: LearningProfile | null): string {
  const ms = practicedMovements(e);
  const known = profile ? ms.filter((m) => knowsMovement(profile, m)) : [];
  const fresh = ms.filter((m) => !known.includes(m));
  const names = (ids: MovementId[]) => ids.map(movementLabel).join(", ");
  if (known.length && fresh.length) return `${eunNeun(names(known))} 배우셨으니 짧게, ${eunNeun(names(fresh))} 처음이라 자세히 안내할게요.`;
  if (known.length) return `${eunNeun(names(known))} 배우셨으니 배운 대로 짧게 안내할게요.`;
  return "처음 하는 동작이라 자세와 방향까지 자세히 안내할게요.";
}
