import type { AdminRole, AdminUser } from "./admin";
import type { Id } from "./common";

/**
 * 로그인 API 형식. 사용자 화면과 관리자 화면이 같은 로그인을 쓴다.
 *   POST /auth/login   LoginInput → LoginResponse     (틀리면 401)
 *   POST /auth/signup  SignupInput → LoginResponse    (가입하고 바로 로그인. 이미 있는 이메일이면 409)
 *   POST /auth/google  GoogleLoginInput → LoginResponse (구글 계정으로 로그인. 처음이면 가입)
 *   GET  /auth/config  → AuthConfig                   (로그인 화면이 무엇을 보여 줄지)
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

/** 이메일로 가입 (docs/decisions/0016) */
export interface SignupInput {
  /** 화면에 보일 이름 */
  name: string;
  email: string;
  password: string;
}

/** 비밀번호 최소 길이 */
export const PASSWORD_MIN_LENGTH = 8;

/** 구글 계정으로 로그인. 구글 로그인 버튼이 돌려준 ID 토큰을 그대로 보낸다 */
export interface GoogleLoginInput {
  credential: string;
}

/** 로그인 화면이 무엇을 보여 줄지 */
export interface AuthConfig {
  /** 구글 로그인에 쓰는 클라이언트 ID (공개 값). 없으면 구글 로그인 버튼을 보여 주지 않는다 */
  googleClientId: string | null;
  /** 이메일 가입을 받는지 */
  signup: boolean;
  /** 체험 계정(예시 데이터의 계정)을 로그인 화면에 보여 줄지. 공개 서버에서는 끈다 */
  demoAccounts: boolean;
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
