import type { AdminUser } from "@yconic/shared-types";
import { FIXTURE_ACCOUNTS } from "@yconic/fixtures";
import { MOCK_USERS } from "./seed";

/**
 * 모의 로그인. 백엔드(apps/api)의 인증 방식이 정해지면 이 파일을 실제 인증 호출로 바꾼다.
 * - 계정과 비밀번호는 개발·시연용이다. 실제 서비스 비밀번호가 아니다.
 * - 브라우저 저장소에 "누가 로그인했는지"만 남긴다. 서버 검증이 없으므로 보안 수단이 아니다.
 * - 관리자 계정으로 로그인하면 관리자 화면(/admin)도 같은 로그인으로 들어간다.
 */

export interface MockAccount {
  id: string;
  name: string;
  email: string;
  /** 시연용 비밀번호 */
  password: string;
  /** 관리자 계정이면 관리자 사용자 ID (MOCK_USERS), 일반 회원이면 null */
  adminUserId: string | null;
}

/** 로그인한 사람. 비밀번호는 담지 않는다. */
export type SignedInAccount = Omit<MockAccount, "password">;

/** 시연용 계정 (@yconic/fixtures). DB 처음 데이터와 같은 계정이다. */
export const MOCK_ACCOUNTS: MockAccount[] = FIXTURE_ACCOUNTS.map((a) => ({
  id: a.id,
  name: a.name,
  email: a.email,
  password: a.password,
  adminUserId: a.adminRole ? a.id : null,
}));

const SESSION_KEY = "yconic.session.account-id";

export type SignInError = "EMPTY" | "NOT_FOUND" | "WRONG_PASSWORD";

export const SIGN_IN_ERROR_TEXT: Record<SignInError, string> = {
  EMPTY: "이메일과 비밀번호를 모두 입력해 주세요.",
  NOT_FOUND: "등록되지 않은 이메일입니다.",
  WRONG_PASSWORD: "비밀번호가 맞지 않습니다.",
};

function strip(a: MockAccount): SignedInAccount {
  const { password: _p, ...rest } = a;
  return rest;
}

/** 이메일·비밀번호를 확인한다. 저장소에는 아무것도 쓰지 않는다. */
export function verifyCredentials(email: string, password: string, accounts: MockAccount[] = MOCK_ACCOUNTS): SignedInAccount | SignInError {
  const e = email.trim().toLowerCase();
  if (!e || !password) return "EMPTY";
  const found = accounts.find((a) => a.email.toLowerCase() === e);
  if (!found) return "NOT_FOUND";
  if (found.password !== password) return "WRONG_PASSWORD";
  return strip(found);
}

export function isSignInError(v: SignedInAccount | SignInError): v is SignInError {
  return typeof v === "string";
}

export function adminUserOf(account: SignedInAccount | null): AdminUser | null {
  if (!account?.adminUserId) return null;
  return MOCK_USERS.find((u) => u.id === account.adminUserId) ?? null;
}

/** 로그인 뒤 돌아갈 주소. 다른 사이트로 보내는 주소는 받지 않는다. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

// ── 브라우저 저장소 ──

export function readSignedInAccount(): SignedInAccount | null {
  try {
    const id = window.localStorage.getItem(SESSION_KEY);
    const found = MOCK_ACCOUNTS.find((a) => a.id === id);
    return found ? strip(found) : null;
  } catch {
    return null;
  }
}

export function signIn(email: string, password: string): SignedInAccount | SignInError {
  const result = verifyCredentials(email, password);
  if (!isSignInError(result)) {
    try {
      window.localStorage.setItem(SESSION_KEY, result.id);
    } catch {
      // 저장하지 못하면 새로 고칠 때 로그아웃된다.
    }
  }
  return result;
}

export function signOut(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // 무시
  }
}
