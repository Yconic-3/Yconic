import { adminUserOfAccount, type AdminApiErrorBody, type AdminUser, type AuthAccount, type LoginResponse } from "@yconic/shared-types";
import { FIXTURE_ACCOUNTS } from "@yconic/fixtures";
import { SIGN_IN_ERROR_TEXT, verifyCredentials } from "@/mock/auth";
import { API_UNREACHABLE_MESSAGE, apiBaseUrl, getApiMode, type ApiMode } from "./api-mode";

/**
 * 로그인 상태. 사용자 화면(/)과 관리자 화면(/admin)이 같은 로그인을 쓴다.
 * - http 모드: 백엔드 POST /auth/login 으로 확인하고 받은 토큰을 브라우저에 보관한다.
 *   관리자 API를 부를 때 이 토큰을 Authorization 헤더로 보낸다.
 * - mock 모드: 서버 없이 시연용 계정으로 확인한다 (src/mock/auth.ts). 보안 수단이 아니다.
 */

/** 로그인한 계정. 비밀번호는 담지 않는다. */
export type SignedInAccount = AuthAccount;

interface StoredSession {
  mode: ApiMode;
  account: SignedInAccount;
  /** http 모드의 로그인 토큰 */
  token: string | null;
  expiresAt: string | null;
}

const SESSION_KEY = "yconic.session";
/** 예전 모의 로그인이 쓰던 키. 읽지 않고 지운다. */
const LEGACY_SESSION_KEY = "yconic.session.account-id";

/**
 * 체험용 계정. 개발용 처음 데이터(packages/fixtures)와 같고, DB 처음 데이터에도 같은 계정이 들어 있다.
 * 실제 서비스에서는 로그인 화면에 이 목록을 보여 주지 않는다.
 */
export const DEMO_ACCOUNTS: (SignedInAccount & { password: string })[] = FIXTURE_ACCOUNTS.map((a) => ({
  id: a.id,
  name: a.name,
  email: a.email,
  adminRole: a.adminRole,
  password: a.password,
}));

export function adminUserOf(account: SignedInAccount | null): AdminUser | null {
  return adminUserOfAccount(account);
}

/** 로그인 뒤 돌아갈 주소. 다른 사이트로 보내는 주소는 받지 않는다. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

// ── 브라우저 저장소 ──

function readStored(): StoredSession | null {
  try {
    window.localStorage.removeItem(LEGACY_SESSION_KEY);
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    // 모드를 바꿨거나 기간이 지난 로그인은 버린다.
    if (s.mode !== getApiMode() || !s.account?.id || (s.expiresAt && Date.parse(s.expiresAt) <= Date.now())) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function writeStored(s: StoredSession | null) {
  try {
    if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // 저장하지 못하면 새로 고칠 때 로그아웃된다.
  }
}

/** 브라우저에 남은 로그인 (서버 확인 전). 화면이 뜬 뒤에 부른다. */
export function readSignedInAccount(): SignedInAccount | null {
  return readStored()?.account ?? null;
}

/** 관리자 API 요청에 붙일 토큰 (http 모드) */
export function getAuthToken(): string | null {
  return readStored()?.token ?? null;
}

/**
 * 남아 있는 로그인이 아직 유효한지 서버에 확인한다 (http 모드).
 * 토큰이 만료되었거나 로그아웃되었으면 지우고 null을 준다. 서버에 연결하지 못하면 남은 로그인을 그대로 쓴다.
 */
export async function verifySession(): Promise<SignedInAccount | null> {
  const s = readStored();
  if (!s || s.mode === "mock" || !s.token) return s?.account ?? null;
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/auth/me`, { headers: { Authorization: `Bearer ${s.token}` } });
  } catch {
    return s.account;
  }
  if (res.status === 401) {
    writeStored(null);
    return null;
  }
  if (!res.ok) return s.account;
  const account = (await res.json()) as SignedInAccount;
  writeStored({ ...s, account });
  return account;
}

export type SignInResult = { ok: true; account: SignedInAccount } | { ok: false; message: string };

export async function signIn(email: string, password: string): Promise<SignInResult> {
  if (!email.trim() || !password) return { ok: false, message: SIGN_IN_ERROR_TEXT.EMPTY };

  if (getApiMode() === "mock") {
    const result = verifyCredentials(email, password);
    if (typeof result === "string") return { ok: false, message: SIGN_IN_ERROR_TEXT[result] };
    writeStored({ mode: "mock", account: result, token: null, expiresAt: null });
    return { ok: true, account: result };
  }

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, message: API_UNREACHABLE_MESSAGE };
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as AdminApiErrorBody | null;
    return { ok: false, message: err?.message ?? `로그인하지 못했습니다. (${res.status})` };
  }
  const body = (await res.json()) as LoginResponse;
  writeStored({ mode: "http", account: body.account, token: body.token, expiresAt: body.expiresAt });
  return { ok: true, account: body.account };
}

export function signOut(): void {
  const s = readStored();
  writeStored(null);
  if (s?.mode === "http" && s.token) {
    // 서버의 로그인도 끝낸다. 실패해도 브라우저에서는 이미 로그아웃되었다.
    void fetch(`${apiBaseUrl()}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${s.token}` } }).catch(() => undefined);
  }
}
