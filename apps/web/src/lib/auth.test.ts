import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAuthConfig, isDemoAccount, readSignedInAccount, signIn, signInWithGoogle, signOut, signUp, signUpProblem } from "./auth";

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
