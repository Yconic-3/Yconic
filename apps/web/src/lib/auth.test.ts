import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAuthConfig, getAuthToken, isDemoAccount, isRememberedSession, readSignedInAccount, signIn, signInWithGoogle, signOut, signUp, signUpProblem, verifySession } from "./auth";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("signUpProblem", () => {
  it("이름, 이메일, 비밀번호를 차례로 본다", () => {
    expect(signUpProblem("", "a@example.org", "password-1234")).toMatch(/이름/);
    expect(signUpProblem("가", "not-an-email", "password-1234")).toMatch(/이메일/);
    expect(signUpProblem("가", "a@example.org", "1234567")).toMatch(/8자/);
    expect(signUpProblem("가", " a@example.org ", "12345678")).toBeNull();
  });
});

describe("서버 없이 볼 때(mock)의 가입과 로그인", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "mock");
    vi.stubGlobal("window", { localStorage: fakeStorage() });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("가입하면 바로 로그인되고, 로그아웃한 뒤 같은 이메일과 비밀번호로 다시 로그인한다", async () => {
    const res = await signUp(" 김회원 ", "Kim@Example.org", "password-1234");
    expect(res).toMatchObject({ ok: true, account: { name: "김회원", email: "kim@example.org", adminRole: null } });
    expect(readSignedInAccount()?.email).toBe("kim@example.org");
    signOut();
    expect(readSignedInAccount()).toBeNull();
    expect(await signIn("kim@example.org", "wrong-password")).toMatchObject({ ok: false });
    expect(await signIn("KIM@example.org", "password-1234")).toMatchObject({ ok: true });
  });

  it("이미 있는 이메일(체험 계정 포함)과 맞지 않는 값은 받지 않는다", async () => {
    expect(await signUp("가", "member@example.com", "password-1234")).toMatchObject({ ok: false, message: expect.stringMatching(/이미 가입/) });
    await signUp("가", "a@example.org", "password-1234");
    expect(await signUp("나", "A@example.org", "password-5678")).toMatchObject({ ok: false });
    expect(await signUp("가", "b@example.org", "short")).toMatchObject({ ok: false, message: expect.stringMatching(/8자/) });
  });

  it("체험 계정은 그대로 로그인되고, 가입한 계정은 체험 계정이 아니다", async () => {
    const demo = await signIn("member@example.com", "member1234");
    expect(demo.ok && isDemoAccount(demo.account)).toBe(true);
    const mine = await signUp("가", "c@example.org", "password-1234");
    expect(mine.ok && isDemoAccount(mine.account)).toBe(false);
  });

  it("구글 로그인은 쓸 수 없고, 로그인 화면에는 가입과 체험 계정만 보인다", async () => {
    expect(await signInWithGoogle("anything")).toMatchObject({ ok: false });
    expect(await fetchAuthConfig()).toEqual({ googleClientId: null, signup: true, demoAccounts: true });
  });
});

describe("로그인 유지", () => {
  let local: ReturnType<typeof fakeStorage>;
  let session: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    local = fakeStorage();
    session = fakeStorage();
    vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("켜면 브라우저를 닫아도 남는 곳에, 끄면 닫을 때 지워지는 곳에 둔다", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "mock");
    await signIn("member@example.com", "member1234");
    expect(local.getItem("yconic.session")).not.toBeNull();
    expect(session.getItem("yconic.session")).toBeNull();
    expect(isRememberedSession()).toBe(true);

    // 끄고 다시 로그인하면 옮겨 간다 (두 곳에 함께 남지 않는다)
    await signIn("member@example.com", "member1234", false);
    expect(local.getItem("yconic.session")).toBeNull();
    expect(session.getItem("yconic.session")).not.toBeNull();
    expect(isRememberedSession()).toBe(false);
    expect(readSignedInAccount()?.email).toBe("member@example.com");

    signOut();
    expect(session.getItem("yconic.session")).toBeNull();
    expect(readSignedInAccount()).toBeNull();
  });

  it("들어올 때 서버에 물어 만료 시각을 새로 적고, 서버에서 끝난 로그인은 지운다", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "http");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "/api");
    const account = { id: "u-1", name: "가", email: "a@example.org", adminRole: null };
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const later = new Date(Date.now() + 30 * 86_400_000).toISOString();
    local.setItem("yconic.session", JSON.stringify({ mode: "http", account, token: "tok", expiresAt: soon, remember: true }));

    const calls: string[] = [];
    let status = 200;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push(`${url} ${(init.headers as Record<string, string>).Authorization}`);
      return status === 200 ? new Response(JSON.stringify({ account: { ...account, name: "나" }, expiresAt: later }), { status: 200 }) : new Response("{}", { status });
    });

    expect((await verifySession())?.name).toBe("나");
    expect(calls).toEqual(["/api/auth/session Bearer tok"]);
    expect(JSON.parse(local.getItem("yconic.session")!)).toMatchObject({ expiresAt: later, token: "tok", remember: true });

    // 서버가 잠깐 안 되면(500) 남은 로그인을 그대로 쓴다
    status = 500;
    expect((await verifySession())?.name).toBe("나");
    expect(getAuthToken()).toBe("tok");

    // 서버에서 끝난 로그인(401)은 지운다
    status = 401;
    expect(await verifySession()).toBeNull();
    expect(local.getItem("yconic.session")).toBeNull();
  });
});
