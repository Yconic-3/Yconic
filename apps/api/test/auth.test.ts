import type { AuthAccount, AuthConfig, LoginResponse } from "@yconic/shared-types";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGoogleVerifier, type GoogleIdentity, type GoogleVerifier } from "../src/auth/google";
import { ApiError } from "../src/common/errors";
import { client, startTestServer, type TestServer } from "./helpers";

const ADMIN_EMAIL = "owner@gmail.example";

/** 가짜 구글: 정해 둔 글자를 받으면 그 사람이라고 답한다 */
const people: Record<string, GoogleIdentity> = {
  "tok-new": { sub: "g-100", email: "new.person@gmail.example", name: "새 사람" },
  "tok-owner": { sub: "g-200", email: ADMIN_EMAIL, name: "운영자" },
  "tok-early": { sub: "g-300", email: "early@gmail.example", name: "먼저 가입" },
};
const fakeGoogle: GoogleVerifier = async (credential) => {
  const who = people[credential];
  if (!who) throw new ApiError("UNAUTHORIZED", "구글 로그인을 확인하지 못했습니다. 다시 시도해 주세요.");
  return who;
};

let s: TestServer;
const anon = () => client(s.baseUrl);
const signup = (body: Record<string, unknown>) => anon().post<LoginResponse>("/auth/signup", body);

beforeAll(async () => {
  s = await startTestServer({ google: fakeGoogle, config: { googleClientId: "test-client-id", superAdminEmails: [ADMIN_EMAIL] } });
});
afterAll(async () => {
  await s?.close();
});
beforeEach(async () => {
  await s.reset();
  s.config.signup = true;
  s.config.signupPerIpPerHour = 1000;
  s.config.signupPerDay = 100000;
});

describe("이메일 가입", () => {
  it("가입하면 바로 로그인되고, 일반 회원이 된다", async () => {
    const res = await signup({ name: " 김회원 ", email: " Kim@Example.org ", password: "password-1234", adminRole: "SUPER_ADMIN" });
    expect(res.status).toBe(201);
    expect(res.body.account).toMatchObject({ name: "김회원", email: "kim@example.org", adminRole: null });
    expect(res.body.account.id).toMatch(/^u-/);
    const me = await client(s.baseUrl, res.body.token).get<AuthAccount>("/auth/me");
    expect(me.body.email).toBe("kim@example.org");
    // 관리자 화면에는 들어가지 못한다
    expect((await client(s.baseUrl, res.body.token).get("/admin/contents")).status).toBe(403);
    // 가입한 이메일과 비밀번호로 다시 로그인한다
    expect((await anon().post("/auth/login", { email: "KIM@example.org", password: "password-1234" })).status).toBe(200);
    expect((await anon().post("/auth/login", { email: "kim@example.org", password: "password-9999" })).status).toBe(401);
  });

  it("가입한 회원은 영상을 올릴 수 있다", async () => {
    const res = await signup({ name: "올리는 사람", email: "up@example.org", password: "password-1234" });
    const me = client(s.baseUrl, res.body.token);
    expect((await me.get("/me/contents")).body).toEqual([]);
    expect((await me.post("/me/uploads", { fileName: "a.mp4", mimeType: "video/mp4", sizeBytes: 10, durationSec: 5, width: 0, height: 0 })).status).toBe(201);
  });

  it("이미 있는 이메일, 짧은 비밀번호, 틀린 이메일, 빈 이름은 받지 않는다", async () => {
    expect((await signup({ name: "가", email: "member@example.com", password: "password-1234" })).status).toBe(409);
    expect((await signup({ name: "가", email: "MEMBER@example.com", password: "password-1234" })).status).toBe(409);
    expect((await signup({ name: "가", email: "a@example.org", password: "1234567" })).status).toBe(400);
    expect((await signup({ name: "가", email: "not-an-email", password: "password-1234" })).status).toBe(400);
    expect((await signup({ name: "  ", email: "a@example.org", password: "password-1234" })).status).toBe(400);
    expect((await signup({ email: "a@example.org", password: "password-1234" })).status).toBe(400);
  });

  it("관리자로 정해 둔 이메일은 이메일 가입을 받지 않는다 (구글로만 들어온다)", async () => {
    const res = await signup({ name: "남", email: ADMIN_EMAIL.toUpperCase(), password: "password-1234" });
    expect(res.status).toBe(400);
    expect((res.body as unknown as { message: string }).message).toMatch(/구글/);
  });

  it("한 곳에서 너무 많이 가입하면 막는다. 가입을 끄면 받지 않는다", async () => {
    s.config.signupPerIpPerHour = 2;
    const from = (ip: string, n: number) =>
      fetch(`${s.baseUrl}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` },
        body: JSON.stringify({ name: "가", email: `limit-${ip}-${n}@example.org`, password: "password-1234" }),
      });
    expect((await from("203.0.113.9", 1)).status).toBe(201);
    expect((await from("203.0.113.9", 2)).status).toBe(201);
    expect((await from("203.0.113.9", 3)).status).toBe(403);
    // 다른 곳에서는 된다
    expect((await from("203.0.113.10", 1)).status).toBe(201);

    s.config.signup = false;
    expect((await from("203.0.113.11", 1)).status).toBe(403);
  });
});

describe("구글 로그인", () => {
  const google = (credential?: string) => anon().post<LoginResponse>("/auth/google", credential === undefined ? {} : { credential });

  it("로그인 화면 설정을 알려 준다", async () => {
    const res = await anon().get<AuthConfig>("/auth/config");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ googleClientId: "test-client-id", signup: true, demoAccounts: true });
  });

  it("처음이면 일반 회원 계정을 만들고, 다음에는 같은 계정으로 들어온다", async () => {
    const first = await google("tok-new");
    expect(first.status).toBe(200);
    expect(first.body.account).toMatchObject({ name: "새 사람", email: "new.person@gmail.example", adminRole: null });
    const again = await google("tok-new");
    expect(again.body.account.id).toBe(first.body.account.id);
    // 구글로만 만든 계정은 비밀번호로 로그인할 수 없다
    const pw = await anon().post("/auth/login", { email: "new.person@gmail.example", password: "anything-1234" });
    expect(pw.status).toBe(401);
    expect(pw.body.message).toMatch(/구글/);
  });

  it("관리자로 정해 둔 이메일은 최고 관리자가 된다", async () => {
    const res = await google("tok-owner");
    expect(res.body.account).toMatchObject({ email: ADMIN_EMAIL, adminRole: "SUPER_ADMIN" });
    const admin = client(s.baseUrl, res.body.token);
    expect((await admin.get("/admin/contents")).status).toBe(200);
    expect((await admin.get("/admin/audit-logs")).status).toBe(200);
  });

  it("같은 이메일로 먼저 가입한 계정이 있으면 그 계정에 잇고, 예전 비밀번호와 로그인은 지운다", async () => {
    const early = await signup({ name: "누군가", email: "early@gmail.example", password: "password-1234" });
    expect(early.status).toBe(201);
    const res = await google("tok-early");
    expect(res.status).toBe(200);
    expect(res.body.account.id).toBe(early.body.account.id);
    // 먼저 만든 사람의 로그인과 비밀번호는 더 쓸 수 없다
    expect((await client(s.baseUrl, early.body.token).get("/auth/me")).status).toBe(401);
    expect((await anon().post("/auth/login", { email: "early@gmail.example", password: "password-1234" })).status).toBe(401);
    expect((await client(s.baseUrl, res.body.token).get("/auth/me")).status).toBe(200);
  });

  it("확인되지 않는 토큰과 빈 요청은 받지 않는다", async () => {
    expect((await google("forged")).status).toBe(401);
    expect((await google()).status).toBe(400);
    expect((await google("")).status).toBe(400);
  });
});

describe("구글 로그인이 꺼져 있을 때", () => {
  it("설정에 클라이언트 ID가 없다고 알리고, 로그인 요청은 받지 않는다", async () => {
    const off = await startTestServer();
    try {
      expect((await client(off.baseUrl).get<AuthConfig>("/auth/config")).body.googleClientId).toBeNull();
      expect((await client(off.baseUrl).post("/auth/google", { credential: "tok-new" })).status).toBe(400);
    } finally {
      await off.close();
    }
  });
});

describe("구글 ID 토큰 확인 (createGoogleVerifier)", () => {
  const CLIENT = "client-123.apps.googleusercontent.com";
  const NOW = 1_800_000_000_000;
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

  function keyPair(kid: string) {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    return { privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid } };
  }
  const k1 = keyPair("kid-1");
  const other = keyPair("kid-1");

  function token(payload: Record<string, unknown>, opts: { key?: KeyObject; kid?: string; alg?: string } = {}) {
    const head = b64({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "kid-1", typ: "JWT" });
    const body = b64(payload);
    const sig = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), opts.key ?? k1.privateKey).toString("base64url");
    return `${head}.${body}.${sig}`;
  }
  const good = { iss: "https://accounts.google.com", aud: CLIENT, exp: NOW / 1000 + 600, sub: "g-1", email: "Someone@Gmail.com", email_verified: true, name: "아무개" };
  let fetched = 0;
  const verifier = createGoogleVerifier(CLIENT, {
    now: () => NOW,
    fetchKeys: async () => {
      fetched++;
      return [k1.jwk];
    },
  });
  const rejects = async (t: string) => expect(verifier(t)).rejects.toMatchObject({ code: "UNAUTHORIZED" });

  it("구글이 서명한, 우리 앱에 준 토큰이면 누구인지 돌려준다", async () => {
    expect(await verifier(token(good))).toEqual({ sub: "g-1", email: "someone@gmail.com", name: "아무개" });
    // 이름이 없으면 이메일 앞부분을 쓴다
    expect((await verifier(token({ ...good, name: undefined }))).name).toBe("someone");
    // 공개 키는 한 번만 받는다
    expect(fetched).toBe(1);
  });

  it("다른 열쇠로 서명했거나 고친 토큰은 받지 않는다", async () => {
    await rejects(token(good, { key: other.privateKey }));
    const [h, , sig] = token(good).split(".");
    await rejects(`${h}.${b64({ ...good, email: "attacker@gmail.com" })}.${sig}`);
    await rejects(token(good, { alg: "none" }));
    await rejects(token(good, { kid: "unknown-kid" }));
    await rejects("not.a.token");
    await rejects("abc");
  });

  it("다른 앱에 준 토큰, 지난 토큰, 구글이 아닌 발급자, 확인 안 된 이메일은 받지 않는다", async () => {
    await rejects(token({ ...good, aud: "other-client" }));
    await rejects(token({ ...good, exp: NOW / 1000 - 600 }));
    await rejects(token({ ...good, iss: "https://evil.example" }));
    await rejects(token({ ...good, email_verified: false }));
    await rejects(token({ ...good, email: undefined }));
    await rejects(token({ ...good, sub: undefined }));
  });
});
