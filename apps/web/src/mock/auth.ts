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
