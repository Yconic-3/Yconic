import type { AdminRole, AdminUser } from "./admin";
import type { Id } from "./common";

/**
 * 로그인 API 형식. 사용자 화면과 관리자 화면이 같은 로그인을 쓴다.
 *   POST /auth/login   LoginInput → LoginResponse     (틀리면 401)
 *   GET  /auth/me      → AuthAccount                  (Authorization: Bearer <token>)
 *   POST /auth/logout  → 204
 * 토큰은 브라우저에 보관하고, 로그인이 필요한 요청마다 Authorization 헤더로 보낸다.
 */

/** 로그인한 계정. 비밀번호는 담지 않는다. */
export interface AuthAccount {
  id: Id;
  name: string;
  email: string;
  /** 관리자 역할. 일반 회원이면 null */
  adminRole: AdminRole | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  account: AuthAccount;
  /** ISO 시각. 이 시각이 지나면 다시 로그인해야 한다 */
  expiresAt: string;
}

/** 관리자 계정이면 관리자 사용자 모양으로, 아니면 null */
export function adminUserOfAccount(a: AuthAccount | null): AdminUser | null {
  if (!a?.adminRole) return null;
  return { id: a.id, name: a.name, email: a.email, role: a.adminRole };
}
