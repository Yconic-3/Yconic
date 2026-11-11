import type { Id } from "./common";

/**
 * 관리자 역할.
 * - VIEWER: 조회만 가능
 * - EDITOR: 콘텐츠 제작 요청·초안 수정·검수 요청
 * - APPROVER: EDITOR 권한 + 최종 승인·사용자 공개
 * - SUPER_ADMIN: 모든 권한 + 감사 로그 조회
 */
export const ADMIN_ROLES = ["VIEWER", "EDITOR", "APPROVER", "SUPER_ADMIN"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  VIEWER: "조회자",
  EDITOR: "편집자",
  APPROVER: "승인권자",
  SUPER_ADMIN: "최고 관리자",
};

export const ADMIN_PERMISSIONS = [
  "content:read",
  "content:edit",
  "content:submit",
  "content:review",
  "content:publish",
  "job:read",
  "job:create",
  "tts:request",
  "audit:read",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const EDITOR_PERMISSIONS: readonly AdminPermission[] = [
  "content:read",
  "content:edit",
  "content:submit",
  "job:read",
  "job:create",
  "tts:request",
];

/**
 * 역할별 권한표. 프론트엔드는 버튼 표시 여부에, 백엔드는 실제 권한 검증에 같은 표를 사용한다.
 * 설계 원칙: AI 생성 콘텐츠의 최종 승인·공개는 승인 권한자(APPROVER 이상)만 할 수 있다.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  VIEWER: ["content:read", "job:read"],
  EDITOR: EDITOR_PERMISSIONS,
  APPROVER: [...EDITOR_PERMISSIONS, "content:review", "content:publish"],
  SUPER_ADMIN: [...ADMIN_PERMISSIONS],
};

export function hasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export interface AdminUser {
  id: Id;
  name: string;
  email: string;
  role: AdminRole;
}
