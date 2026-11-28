import { adminUserOfAccount, PASSWORD_MIN_LENGTH, type AdminApiErrorBody, type AdminUser, type AuthAccount, type AuthConfig, type LoginResponse } from "@yconic/shared-types";
import { FIXTURE_ACCOUNTS } from "@yconic/fixtures";
import { addMockSignup, MOCK_ACCOUNTS, readMockSignups, SIGN_IN_ERROR_TEXT, verifyCredentials } from "@/mock/auth";
import { API_UNREACHABLE_MESSAGE, apiBaseUrl, getApiMode, type ApiMode } from "./api-mode";

/**
 * 로그인 상태. 사용자 화면(/)과 관리자 화면(/admin)이 같은 로그인을 쓴다.
 * - http 모드: 백엔드 POST /auth/login 으로 확인하고 받은 토큰을 브라우저에 보관한다.
 *   관리자 API를 부를 때 이 토큰을 Authorization 헤더로 보낸다.
 * - mock 모드: 서버 없이 시연용 계정으로 확인한다 (src/mock/auth.ts). 보안 수단이 아니다.
 * 이메일 가입과 구글 로그인도 여기서 한다 (docs/decisions/0016). 구글 로그인은 서버(http 모드)에서만 된다.
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
 * 공개 서버에서는 로그인 화면에 이 목록을 보여 주지 않는다 (AuthConfig.demoAccounts).
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

/** 로그인·가입 요청을 보내고, 성공하면 받은 토큰을 브라우저에 보관한다 (http 모드) */
async function postAuth(path: string, body: unknown, failed: string): Promise<SignInResult> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: API_UNREACHABLE_MESSAGE };
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as AdminApiErrorBody | null;
    return { ok: false, message: err?.message ?? `${failed} (${res.status})` };
  }
  const login = (await res.json()) as LoginResponse;
  writeStored({ mode: "http", account: login.account, token: login.token, expiresAt: login.expiresAt });
  return { ok: true, account: login.account };
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  if (!email.trim() || !password) return { ok: false, message: SIGN_IN_ERROR_TEXT.EMPTY };

  if (getApiMode() === "mock") {
    const result = verifyCredentials(email, password, [...MOCK_ACCOUNTS, ...readMockSignups()]);
    if (typeof result === "string") return { ok: false, message: SIGN_IN_ERROR_TEXT[result] };
    writeStored({ mode: "mock", account: result, token: null, expiresAt: null });
    return { ok: true, account: result };
  }
  return postAuth("/auth/login", { email, password }, "로그인하지 못했습니다.");
}

/** 가입할 때 화면에서 먼저 보는 것. 문제가 없으면 null (서버도 같은 것을 다시 확인한다) */
export function signUpProblem(name: string, email: string, password: string): string | null {
  if (!name.trim()) return "이름을 입력해 주세요.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "이메일 주소를 확인해 주세요.";
  if (password.length < PASSWORD_MIN_LENGTH) return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  return null;
}

/** 이메일로 가입한다. 가입하면 바로 로그인된다 */
export async function signUp(name: string, email: string, password: string): Promise<SignInResult> {
  const problem = signUpProblem(name, email, password);
  if (problem) return { ok: false, message: problem };

  if (getApiMode() === "mock") {
    const result = addMockSignup(name, email, password);
    if (result === "EXISTS") return { ok: false, message: "이미 가입된 이메일입니다. 로그인해 주세요." };
    writeStored({ mode: "mock", account: result, token: null, expiresAt: null });
    return { ok: true, account: result };
  }
  return postAuth("/auth/signup", { name: name.trim(), email: email.trim(), password }, "가입하지 못했습니다.");
}

/** 구글 로그인 버튼이 돌려준 ID 토큰으로 로그인한다. 처음이면 계정이 만들어진다 */
export async function signInWithGoogle(credential: string): Promise<SignInResult> {
  if (getApiMode() === "mock") return { ok: false, message: "구글 로그인은 서버에 연결했을 때만 쓸 수 있습니다." };
  return postAuth("/auth/google", { credential }, "구글로 로그인하지 못했습니다.");
}

/** 서버 없이 볼 때의 로그인 화면 설정 */
const MOCK_AUTH_CONFIG: AuthConfig = { googleClientId: null, signup: true, demoAccounts: true };
/** 서버에 묻지 못했을 때: 이메일 로그인만 보여 준다 */
const FALLBACK_AUTH_CONFIG: AuthConfig = { googleClientId: null, signup: true, demoAccounts: false };
let authConfig: Promise<AuthConfig> | null = null;

/** 로그인 화면이 무엇을 보여 줄지 (구글 로그인 버튼, 가입, 체험 계정). 한 번 물으면 기억한다 */
export function fetchAuthConfig(): Promise<AuthConfig> {
  if (getApiMode() === "mock") return Promise.resolve(MOCK_AUTH_CONFIG);
  authConfig ??= fetch(`${apiBaseUrl()}/auth/config`)
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<AuthConfig>;
    })
    .catch(() => {
      // 다음에 다시 묻는다
      authConfig = null;
      return FALLBACK_AUTH_CONFIG;
    });
  return authConfig;
}

/** 체험 계정(예시 데이터의 계정)인지 */
export function isDemoAccount(account: Pick<SignedInAccount, "id">): boolean {
  return DEMO_ACCOUNTS.some((a) => a.id === account.id);
}

export function signOut(): void {
  const s = readStored();
  writeStored(null);
  if (s?.mode === "http" && s.token) {
    // 서버의 로그인도 끝낸다. 실패해도 브라우저에서는 이미 로그아웃되었다.
    void fetch(`${apiBaseUrl()}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${s.token}` } }).catch(() => undefined);
  }
}
