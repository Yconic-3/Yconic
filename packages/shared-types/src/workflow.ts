import { hasPermission, type AdminPermission, type AdminRole } from "./admin";
import type { Id } from "./common";
import type { ContentStatus, ExerciseContent } from "./exercise";

/** 콘텐츠 상태를 바꾸는 관리자 행동 */
export const CONTENT_ACTIONS = [
  "SUBMIT_FOR_REVIEW",
  "REQUEST_CHANGES",
  "APPROVE",
  "PUBLISH",
  "UNPUBLISH",
  "ARCHIVE",
  "RESTORE",
] as const;
export type ContentAction = (typeof CONTENT_ACTIONS)[number];

export interface ContentTransition {
  label: string;
  from: readonly ContentStatus[];
  to: ContentStatus;
  permission: AdminPermission;
  /** 실행 전에 확인 대화상자를 띄워야 하는 행동인지 */
  needsConfirm: boolean;
}

/**
 * 상태 전이 규칙. 백엔드도 같은 규칙으로 검증해야 한다.
 * AI 에이전트는 이 행동 중 APPROVE / PUBLISH를 단독으로 실행할 수 없다 (설계 문서 4·6장).
 */
export const CONTENT_TRANSITIONS: Record<ContentAction, ContentTransition> = {
  SUBMIT_FOR_REVIEW: {
    label: "검수 요청",
    from: ["DRAFT", "CHANGES_REQUESTED"],
    to: "IN_REVIEW",
    permission: "content:submit",
    needsConfirm: false,
  },
  REQUEST_CHANGES: {
    label: "수정 요청",
    from: ["IN_REVIEW", "APPROVED"],
    to: "CHANGES_REQUESTED",
    permission: "content:review",
    needsConfirm: false,
  },
  APPROVE: {
    label: "승인",
    from: ["IN_REVIEW"],
    to: "APPROVED",
    permission: "content:review",
    needsConfirm: true,
  },
  PUBLISH: {
    label: "사용자에게 공개",
    from: ["APPROVED"],
    to: "PUBLISHED",
    permission: "content:publish",
    needsConfirm: true,
  },
  UNPUBLISH: {
    label: "공개 중단",
    from: ["PUBLISHED"],
    to: "APPROVED",
    permission: "content:publish",
    needsConfirm: true,
  },
  ARCHIVE: {
    label: "보관",
    from: ["DRAFT", "CHANGES_REQUESTED", "APPROVED"],
    to: "ARCHIVED",
    permission: "content:edit",
    needsConfirm: true,
  },
  RESTORE: {
    label: "보관 해제",
    from: ["ARCHIVED"],
    to: "DRAFT",
    permission: "content:edit",
    needsConfirm: false,
  },
};

/** 이 역할이 이 상태의 콘텐츠에 해당 행동을 할 수 있는지 */
export function canPerformAction(role: AdminRole, status: ContentStatus, action: ContentAction): boolean {
  const t = CONTENT_TRANSITIONS[action];
  return t.from.includes(status) && hasPermission(role, t.permission);
}

export function availableActions(role: AdminRole, status: ContentStatus): ContentAction[] {
  return CONTENT_ACTIONS.filter((a) => canPerformAction(role, status, a));
}

/** 내용 수정이 가능한 상태. 검수 중·승인·공개 상태는 잠가서, 검수한 내용과 공개 내용이 달라지지 않게 한다. */
export const EDITABLE_STATUSES: readonly ContentStatus[] = ["DRAFT", "CHANGES_REQUESTED"];

export function canEditContent(role: AdminRole, status: ContentStatus): boolean {
  return EDITABLE_STATUSES.includes(status) && hasPermission(role, "content:edit");
}

/**
 * 자기 승인 금지 (docs/decisions/0003).
 * 콘텐츠를 처음 만든 사람과 검수를 요청한 사람은 그 콘텐츠를 승인할 수 없다. 역할과 상관없이 적용한다.
 * 반환값이 null이 아니면 그 이유로 거절한다. 백엔드도 같은 규칙으로 검증해야 한다.
 */
export const SELF_APPROVAL_MESSAGE = "직접 만들었거나 검수를 요청한 콘텐츠는 다른 승인권자가 승인해야 합니다.";

export function selfApprovalBlockedReason(
  actorId: Id,
  action: ContentAction,
  content: Pick<ExerciseContent, "createdBy" | "submittedBy">,
): string | null {
  if (action !== "APPROVE") return null;
  if (actorId === content.createdBy || (content.submittedBy !== null && actorId === content.submittedBy)) {
    return SELF_APPROVAL_MESSAGE;
  }
  return null;
}
