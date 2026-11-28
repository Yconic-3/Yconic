import { authSessions } from "@yconic/database";
import type { LoginResponse, SessionInfo } from "@yconic/shared-types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { client, startTestServer, type TestServer } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
let s: TestServer;
const anon = () => client(s.baseUrl);
const login = (remember?: boolean) => anon().post<LoginResponse>("/auth/login", { email: "member@example.com", password: "member1234", ...(remember === undefined ? {} : { remember }) });
const daysLeft = (iso: string) => (Date.parse(iso) - Date.now()) / DAY;
/** 이 서버의 모든 로그인의 만료 시각을 지금부터 ms 뒤로 바꾼다 */
const setExpiry = (ms: number) => s.conn.db.update(authSessions).set({ expiresAt: new Date(Date.now() + ms) });

beforeAll(async () => {
  s = await startTestServer();
});
afterAll(async () => {
  await s?.close();
});
beforeEach(async () => {
  await s.reset();
});

describe("로그인 유지", () => {
  it("로그인 유지를 켜면(기본) 30일, 끄면 하루 동안 남는다", async () => {
    expect(daysLeft((await login()).body.expiresAt)).toBeCloseTo(30, 1);
    expect(daysLeft((await login(true)).body.expiresAt)).toBeCloseTo(30, 1);
    expect(daysLeft((await login(false)).body.expiresAt)).toBeCloseTo(1, 1);
    // 가입할 때도 고를 수 있다
    const up = await anon().post<LoginResponse>("/auth/signup", { name: "가", email: "keep@example.org", password: "password-1234", remember: false });
    expect(daysLeft(up.body.expiresAt)).toBeCloseTo(1, 1);
  });

  it("로그인 유지면 쓰는 동안 기간이 다시 늘어난다", async () => {
    const res = await login(true);
    const me = client(s.baseUrl, res.body.token);
    // 아직 절반 넘게 남았으면 그대로 둔다
    await setExpiry(20 * DAY);
    expect(daysLeft((await me.get<SessionInfo>("/auth/session")).body.expiresAt)).toBeCloseTo(20, 1);
    // 절반 아래로 내려가면 다시 30일
    await setExpiry(10 * DAY);
    const again = await me.get<SessionInfo>("/auth/session");
    expect(again.status).toBe(200);
    expect(again.body.account.email).toBe("member@example.com");
    expect(daysLeft(again.body.expiresAt)).toBeCloseTo(30, 1);
    // 다른 요청을 해도 늘어난다 (로그인 확인을 거치는 모든 요청)
    await setExpiry(3 * DAY);
    expect((await me.get("/me/contents")).status).toBe(200);
    expect(daysLeft((await me.get<SessionInfo>("/auth/session")).body.expiresAt)).toBeCloseTo(30, 1);
  });

  it("로그인 유지를 끄면 늘어나지 않고, 기간이 지나면 다시 로그인해야 한다", async () => {
    const res = await login(false);
    const me = client(s.baseUrl, res.body.token);
    await setExpiry(60 * 60 * 1000);
    expect(daysLeft((await me.get<SessionInfo>("/auth/session")).body.expiresAt)).toBeLessThan(0.1);
    await setExpiry(-1000);
    expect((await me.get("/auth/session")).status).toBe(401);
    expect((await me.get("/auth/me")).status).toBe(401);
  });

  it("로그인 유지여도 기간이 다 지난 뒤에는 되살아나지 않는다. 로그아웃하면 바로 끝난다", async () => {
    const res = await login(true);
    const me = client(s.baseUrl, res.body.token);
    await setExpiry(-1000);
    expect((await me.get("/auth/session")).status).toBe(401);

    const other = await login(true);
    const two = client(s.baseUrl, other.body.token);
    expect((await two.get("/auth/session")).status).toBe(200);
    await two.post("/auth/logout");
    expect((await two.get("/auth/session")).status).toBe(401);
    expect((await anon().get("/auth/session")).status).toBe(401);
  });
});
