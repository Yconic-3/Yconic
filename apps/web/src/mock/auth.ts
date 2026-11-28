import type { AuthAccount } from "@yconic/shared-types";
import { FIXTURE_ACCOUNTS } from "@yconic/fixtures";

/**
 * 모의 로그인 (NEXT_PUBLIC_API_MODE=mock 일 때만 쓴다). 로그인 상태 보관은 src/lib/auth.ts 가 한다.
 * - 계정과 비밀번호는 개발·시연용이다. 실제 서비스 비밀번호가 아니다.
 * - 서버 검증이 없으므로 보안 수단이 아니다.
 */

export interface MockAccount extends AuthAccount {
  /** 시연용 비밀번호 */
  password: string;
}

/** 시연용 계정 (@yconic/fixtures). DB 처음 데이터와 같은 계정이다. */
export const MOCK_ACCOUNTS: MockAccount[] = FIXTURE_ACCOUNTS.map((a) => ({
  id: a.id,
  name: a.name,
  email: a.email,
  adminRole: a.adminRole,
  password: a.password,
}));

export type SignInError = "EMPTY" | "NOT_FOUND" | "WRONG_PASSWORD";

export const SIGN_IN_ERROR_TEXT: Record<SignInError, string> = {
  EMPTY: "이메일과 비밀번호를 모두 입력해 주세요.",
  NOT_FOUND: "등록되지 않은 이메일입니다.",
  WRONG_PASSWORD: "비밀번호가 맞지 않습니다.",
};

const MOCK_SIGNUPS_KEY = "yconic.mock.signups";

/** 모의 모드에서 가입한 계정 (이 브라우저에만 남는다) */
export function readMockSignups(): MockAccount[] {
  try {
    const list: unknown = JSON.parse(window.localStorage.getItem(MOCK_SIGNUPS_KEY) ?? "[]");
    return Array.isArray(list) ? (list as MockAccount[]).filter((a) => a && typeof a.email === "string" && typeof a.password === "string") : [];
  } catch {
    return [];
  }
}

/** 모의 가입. 이미 있는 이메일이면 "EXISTS" */
export function addMockSignup(name: string, email: string, password: string): AuthAccount | "EXISTS" {
  const e = email.trim().toLowerCase();
  const signups = readMockSignups();
  if ([...MOCK_ACCOUNTS, ...signups].some((a) => a.email.toLowerCase() === e)) return "EXISTS";
  const account: MockAccount = { id: `u-mock-${Date.now().toString(36)}`, name: name.trim(), email: e, adminRole: null, password };
  try {
    window.localStorage.setItem(MOCK_SIGNUPS_KEY, JSON.stringify([...signups, account]));
  } catch {
    // 저장하지 못하면 이번 로그인만 된다
  }
  const { password: _p, ...rest } = account;
  return rest;
}

/** 이메일·비밀번호를 확인한다. 저장소에는 아무것도 쓰지 않는다. */
export function verifyCredentials(email: string, password: string, accounts: MockAccount[] = MOCK_ACCOUNTS): AuthAccount | SignInError {
  const e = email.trim().toLowerCase();
  if (!e || !password) return "EMPTY";
  const found = accounts.find((a) => a.email.toLowerCase() === e);
  if (!found) return "NOT_FOUND";
  if (found.password !== password) return "WRONG_PASSWORD";
  const { password: _p, ...account } = found;
  return account;
}
