import type { Id } from "./common";
import { CONTENT_STATUS_LABELS, type ExerciseContent } from "./exercise";
import { findVisualOnlyPhrases, validateExerciseContent } from "./validation";
import { EDITABLE_STATUSES } from "./workflow";

/**
 * 회원 콘텐츠 올리기 API (docs/decisions/0007). 로그인한 회원이면 누구나 쓴다.
 * 자기가 올린 영상·작업·콘텐츠만 보고 고칠 수 있다. 공개는 운영자(승인권자)가 승인한 뒤에만 된다.
 *   POST  /me/videos                    multipart(file, durationSec, width, height) → VideoAsset
 *   DELETE /me/videos/:id               → 204  (내가 올렸고 어디에도 연결되지 않은 영상만)
 *   POST  /me/content-jobs              CreateContentJobInput → ContentJob   (내가 올린 영상만)
 *   GET   /me/content-jobs/:id          → ContentJob
 *   GET   /me/contents                  → MyContent[]
 *   GET   /me/contents/:id              → MyContent
 *   PATCH /me/contents/:id/guides       UpdateMyGuidesInput → MyContent
 *   POST  /me/contents/:id/submit       SubmitMyContentInput → MyContent    (검수 요청)
 * 오류는 { code, message } 모양이다 (관리자 API와 같은 코드).
 */

/** 올린 사람이 보는 콘텐츠. 운영자 내부 메모는 빼고, 검수 의견은 보여 준다 */
export type MyContent = Omit<ExerciseContent, "internalNote">;

export function toMyContent(c: ExerciseContent): MyContent {
  const { internalNote: _internal, ...rest } = c;
  return rest;
}

/** 단계별 음성 안내만 고친다. 구간 시각·순서는 운영자가 관리자 화면에서 고친다 */
export interface UpdateMyGuidesInput {
  expectedVersion: number;
  segments: { id: Id; voiceGuide: string }[];
}

export interface SubmitMyContentInput {
  expectedVersion: number;
  /** "동작 설명이 정확하고 안전한지 직접 확인했습니다"에 표시했는지 */
  confirmed: boolean;
}

/** 올린 사람이 고칠 수 있는 상태인지 (초안, 수정 요청) */
export function canCreatorEdit(content: Pick<ExerciseContent, "status">): boolean {
  return EDITABLE_STATUSES.includes(content.status);
}

/** 화면을 봐야 알 수 있는 표현이 남은 단계 번호 (1부터) */
export function stepsWithVisualPhrases(content: Pick<ExerciseContent, "segments">): number[] {
  return content.segments.flatMap((s, i) => (findVisualOnlyPhrases(s.voiceGuide).length > 0 ? [i + 1] : []));
}

/**
 * 올린 사람이 검수를 요청할 수 없는 이유. 요청할 수 있으면 null.
 * 관리자 검수 요청보다 엄격하다: 시각 의존 표현("이렇게", "여기" 등)이 남아 있으면 막는다.
 * 음성 안내가 빈 단계는 운영자가 판단하도록 막지 않는다 (일반 사용자도 함께 쓰므로, CLAUDE.md).
 */
export function creatorSubmitBlockedReason(
  content: Pick<ExerciseContent, "status" | "title" | "summary" | "precautions" | "segments"> & { video: Pick<ExerciseContent["video"], "durationSec"> },
  confirmed: boolean,
): string | null {
  if (!canCreatorEdit(content)) return `${CONTENT_STATUS_LABELS[content.status]} 상태에서는 검수를 요청할 수 없습니다.`;
  const visual = stepsWithVisualPhrases(content);
  if (visual.length > 0) {
    return `화면을 봐야 알 수 있는 표현이 ${visual.join(", ")}단계에 남아 있습니다. 고친 뒤 다시 요청해 주세요.`;
  }
  // 요약이 비어 있는 것은 운영자가 채울 수 있으므로 막지 않는다
  const errors = validateExerciseContent({ ...content, summary: content.summary || "-" }).filter(
    (i) => i.severity === "ERROR" && !i.field.endsWith(".voiceGuide"),
  );
  if (errors.length > 0) return errors[0]!.message;
  if (!confirmed) return "동작 설명이 정확하고 안전한지 확인했다는 표시를 먼저 해 주세요.";
  return null;
}
