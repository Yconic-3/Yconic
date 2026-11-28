import {
  CONTENT_STATUS_LABELS,
  canPerformAction,
  publishActionFor,
  selfApprovalBlockedReason,
  type AdminUser,
  type ContentAction,
  type ContentStatus,
  type ExerciseContent,
} from "@yconic/shared-types";

/**
 * 관리자 화면이 보여 줄 단추를 정한다 (docs/decisions/0023).
 * 여섯 가지 상태와 아홉 가지 행동을 그대로 보여 주지 않고, 지금 할 수 있는 가장 알맞은 일을 고른다:
 * 비공개면 "공개하기", 공개면 "비공개로". 공개할 권한이 없거나 직접 올린 영상이면 "공개 요청".
 */
export interface PlannedAction {
  action: ContentAction;
  label: string;
  variant: "primary" | "secondary";
  /** 값이 있으면 단추를 잠그고 이유를 보여 준다 */
  blocked: string | null;
  /** 단추 옆에 덧붙이는 설명 */
  hint?: string;
}

export const SELF_PUBLISH_BLOCKED = "직접 올렸거나 공개를 요청한 영상은 다른 승인권자가 공개해야 합니다.";

/**
 * 이 사람이 이 콘텐츠에 지금 할 수 있는 일. 첫 번째가 가장 알맞은 일이다.
 * publishBlocked: 공개·공개 요청을 막는 이유 (저장하지 않은 변경, 고쳐야 할 것, 다시 분석 중)
 */
export function planActions(user: Pick<AdminUser, "id" | "role">, content: Pick<ExerciseContent, "status" | "createdBy" | "submittedBy">, publishBlocked: string | null = null): PlannedAction[] {
  const { status } = content;
  const can = (a: ContentAction) => canPerformAction(user.role, status, a);
  const out: PlannedAction[] = [];
  const publish = publishActionFor(status);

  if (publish && can(publish)) {
    const self = selfApprovalBlockedReason(user.id, publish, content, user.role);
    if (self && can("SUBMIT_FOR_REVIEW")) {
      // 직접 올린 것은 스스로 공개할 수 없다. 다른 승인권자에게 공개를 요청한다
      out.push({ action: "SUBMIT_FOR_REVIEW", label: "공개 요청", variant: "primary", blocked: publishBlocked, hint: "직접 올린 영상은 다른 승인권자가 공개합니다." });
    } else {
      out.push({ action: publish, label: "공개하기", variant: "primary", blocked: self ? SELF_PUBLISH_BLOCKED : publishBlocked });
    }
  } else if (can("SUBMIT_FOR_REVIEW")) {
    out.push({ action: "SUBMIT_FOR_REVIEW", label: "공개 요청", variant: "primary", blocked: publishBlocked, hint: "승인권자가 확인한 뒤 공개합니다." });
  }
  if (status === "IN_REVIEW" && can("REQUEST_CHANGES")) out.push({ action: "REQUEST_CHANGES", label: "돌려보내기", variant: "secondary", blocked: null });
  if (can("UNPUBLISH")) out.push({ action: "UNPUBLISH", label: "비공개로", variant: "secondary", blocked: null });
  if (can("RESTORE")) out.push({ action: "RESTORE", label: "보관 해제", variant: "secondary", blocked: null });
  return out;
}

/** 행동이 끝난 뒤 보여 줄 말 */
export function actionDoneMessage(action: ContentAction, next: ContentStatus): string {
  switch (action) {
    case "PUBLISH":
    case "PUBLISH_NOW":
      return "공개했습니다. 사용자 앱의 운동 목록에 나옵니다.";
    case "UNPUBLISH":
      return "비공개로 바꿨습니다.";
    case "REVISE":
      return "비공개로 돌렸습니다. 이제 고칠 수 있습니다.";
    case "SUBMIT_FOR_REVIEW":
      return "공개를 요청했습니다. 승인권자가 확인한 뒤 공개합니다.";
    case "REQUEST_CHANGES":
      return "올린 사람에게 돌려보냈습니다.";
    case "ARCHIVE":
      return "보관했습니다.";
    case "RESTORE":
      return "보관을 해제했습니다.";
    default:
      return `상태를 "${CONTENT_STATUS_LABELS[next]}"(으)로 바꿨습니다.`;
  }
}
