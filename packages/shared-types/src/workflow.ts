import { hasPermission, type AdminPermission, type AdminRole } from "./admin";
import type { Id } from "./common";
import type { ContentStatus, ExerciseContent } from "./exercise";

/** 콘텐츠 상태를 바꾸는 관리자 행동 */
export const CONTENT_ACTIONS = [
  "SUBMIT_FOR_REVIEW",
  "REQUEST_CHANGES",
  "APPROVE",
  "PUBLISH",
  "PUBLISH_NOW",
  "UNPUBLISH",
  "REVISE",
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
 * AI 에이전트는 이 행동 중 APPROVE / PUBLISH / PUBLISH_NOW를 단독으로 실행할 수 없다 (설계 문서 4·6장).
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
  /**
   * 승인과 공개를 한 번에 한다 (관리자 화면의 "공개하기", docs/decisions/0023).
   * 승인을 포함하므로 자기 승인 금지가 그대로 적용되고, 백엔드는 content:review 권한과 검사 규칙(오류 없음)도 확인한다.
   */
  PUBLISH_NOW: {
    label: "바로 공개",
    from: ["DRAFT", "CHANGES_REQUESTED", "IN_REVIEW"],
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
  /** 승인됐거나 공개 중인 콘텐츠를 다시 고칠 수 있게 초안으로 돌린다. 공개 중이었으면 비공개가 된다 */
  REVISE: {
    label: "비공개로 돌려 고치기",
    from: ["APPROVED", "PUBLISHED"],
    to: "DRAFT",
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
  if (!t.from.includes(status) || !hasPermission(role, t.permission)) return false;
  // 바로 공개는 승인을 포함하므로 승인 권한도 있어야 한다
  if (action === "PUBLISH_NOW" && !hasPermission(role, "content:review")) return false;
  return true;
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
 * 자기 승인 금지 (docs/decisions/0003, 0023).
 * 콘텐츠를 처음 만든 사람과 검수를 요청한 사람은 그 콘텐츠를 승인할 수 없다. 승인을 포함하는 "바로 공개"도 같다.
 * 최고 관리자만 예외다 (혼자 운영해도 공개할 수 있게, 0023). 역할을 넘기지 않으면 예외 없이 막는다.
 * 반환값이 null이 아니면 그 이유로 거절한다. 백엔드도 같은 규칙으로 검증해야 한다.
 */
export const SELF_APPROVAL_MESSAGE = "직접 만들었거나 검수를 요청한 콘텐츠는 다른 승인권자가 승인해야 합니다.";

export function selfApprovalBlockedReason(
  actorId: Id,
  action: ContentAction,
  content: Pick<ExerciseContent, "createdBy" | "submittedBy">,
  actorRole?: AdminRole,
): string | null {
  if (action !== "APPROVE" && action !== "PUBLISH_NOW") return null;
  if (actorRole === "SUPER_ADMIN") return null;
  if (actorId === content.createdBy || (content.submittedBy !== null && actorId === content.submittedBy)) {
    return SELF_APPROVAL_MESSAGE;
  }
  return null;
}

/**
 * 관리자 화면에서 보여 주는 쉬운 공개 상태 (docs/decisions/0023).
 * 여섯 가지 상태를 그대로 보여 주지 않고 공개 / 비공개 / 공개 요청 / 보관으로 묶는다.
 */
export const VISIBILITIES = ["PUBLIC", "PRIVATE", "REQUESTED", "ARCHIVED"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  PUBLIC: "공개",
  PRIVATE: "비공개",
  REQUESTED: "공개 요청",
  ARCHIVED: "보관",
};

export function visibilityOf(status: ContentStatus): Visibility {
  if (status === "PUBLISHED") return "PUBLIC";
  if (status === "IN_REVIEW") return "REQUESTED";
  if (status === "ARCHIVED") return "ARCHIVED";
  return "PRIVATE";
}

/** "공개하기"를 누르면 할 행동. 이미 승인된 것은 공개만, 그 밖에는 승인과 공개를 한 번에 한다. 공개할 수 없는 상태면 null */
export function publishActionFor(status: ContentStatus): ContentAction | null {
  if (status === "APPROVED") return "PUBLISH";
  if (CONTENT_TRANSITIONS.PUBLISH_NOW.from.includes(status)) return "PUBLISH_NOW";
  return null;
}
