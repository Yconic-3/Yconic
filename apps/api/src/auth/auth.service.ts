import { Inject, Injectable } from "@nestjs/common";
import { accounts, authSessions, type Database } from "@yconic/database";
import { hashPassword, verifyPassword } from "@yconic/database/password";
import type { AuthAccount, AuthConfig, LoginResponse, SessionInfo, SignupInput } from "@yconic/shared-types";
import { and, eq, gt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "../common/errors";
import { newId } from "../common/ids";
import type { ApiConfig } from "../config";
import { CONFIG, DB, GOOGLE } from "../tokens";
import type { GoogleVerifier } from "./google";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function bearerToken(header: string | undefined): string | null {
  const m = header ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
  return m ? m[1]!.trim() : null;
}

/** 이미 있는 값이라 넣지 못했는지 (PostgreSQL unique_violation) */
function isDuplicate(e: unknown): boolean {
  for (let cur: unknown = e; cur && typeof cur === "object"; cur = (cur as { cause?: unknown }).cause) {
    if ((cur as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

const HOUR_MS = 60 * 60 * 1000;

type AccountRow = typeof accounts.$inferSelect;

/** 로그인·가입과 로그인 유지 토큰. 토큰 원문은 저장하지 않고 해시만 저장한다. */
@Injectable()
export class AuthService {
  /** 가입 횟수 제한 (이 서버가 켜져 있는 동안만 센다) */
  private readonly signupsByIp = new Map<string, number[]>();
  private signupDay = { day: "", count: 0 };

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(GOOGLE) private readonly google: GoogleVerifier | null,
  ) {}

  /** 로그인 화면이 무엇을 보여 줄지 */
  authConfig(): AuthConfig {
    return { googleClientId: this.google ? this.config.googleClientId : null, signup: this.config.signup, demoAccounts: this.config.demoAccounts };
  }

  private async findByEmail(email: string): Promise<AccountRow | undefined> {
    const [row] = await this.db
      .select()
      .from(accounts)
      .where(sql`lower(${accounts.email}) = ${email.trim().toLowerCase()}`);
    return row;
  }

  /** 로그인이 남는 시간. 로그인 유지면 길게(30일), 아니면 짧게(하루) */
  private lifetimeMs(remember: boolean): number {
    return remember ? this.config.sessionDays * 24 * HOUR_MS : this.config.shortSessionHours * HOUR_MS;
  }

  /** 로그인 토큰을 새로 만들어 준다 */
  private async issue(row: Pick<AccountRow, "id" | "name" | "email" | "adminRole">, remember: boolean): Promise<LoginResponse> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.lifetimeMs(remember));
    await this.db.insert(authSessions).values({ tokenHash: hashToken(token), accountId: row.id, expiresAt, remember });
    return { token, expiresAt: expiresAt.toISOString(), account: { id: row.id, name: row.name, email: row.email, adminRole: row.adminRole } };
  }

  /**
   * viaPublicLink: 공개 링크(Cloudflare 임시 주소)로 들어온 요청이면 true.
   * 저장소가 공개라 예시 관리자 계정의 비밀번호도 공개되어 있으므로, 공개 링크에서는 관리자 계정으로 로그인할 수 없다.
   * 관리자 화면은 이 컴퓨터(localhost)에서만 쓴다.
   */
  async login(email: unknown, password: unknown, viaPublicLink = false, remember = true): Promise<LoginResponse> {
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      throw new ApiError("VALIDATION", "이메일과 비밀번호를 모두 입력해 주세요.");
    }
    const row = await this.findByEmail(email);
    // 이메일이 없는 경우와 비밀번호가 틀린 경우를 구분해서 알려 준다 (시연 단계의 화면 문구와 맞춤).
    if (!row) throw new ApiError("UNAUTHORIZED", "등록되지 않은 이메일입니다.");
    if (!row.passwordHash) throw new ApiError("UNAUTHORIZED", "이 계정은 구글 계정으로 로그인해 주세요.");
    if (!(await verifyPassword(password, row.passwordHash))) throw new ApiError("UNAUTHORIZED", "비밀번호가 맞지 않습니다.");
    if (viaPublicLink && row.adminRole && !this.config.publicLinkAdminLogin) {
      throw new ApiError("FORBIDDEN", "공개 링크에서는 관리자 계정으로 로그인할 수 없습니다. 일반 회원으로 로그인해 주세요.");
    }
    return this.issue(row, remember);
  }

  /** 한 곳(IP)과 하루 전체의 가입 수를 센다. 넘으면 거절한다 */
  private countSignup(ip: string): void {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    if (this.signupDay.day !== day) this.signupDay = { day, count: 0 };
    const recent = (this.signupsByIp.get(ip) ?? []).filter((t) => now - t < HOUR_MS);
    if (recent.length >= this.config.signupPerIpPerHour || this.signupDay.count >= this.config.signupPerDay) {
      throw new ApiError("FORBIDDEN", "가입 요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.");
    }
    recent.push(now);
    this.signupsByIp.set(ip, recent);
    this.signupDay.count++;
    // 오래 켜 두어도 기억이 쌓이지 않게, 가끔 지난 기록을 치운다
    if (this.signupsByIp.size > 5000) {
      for (const [key, times] of this.signupsByIp) if (times.every((t) => now - t >= HOUR_MS)) this.signupsByIp.delete(key);
    }
  }

  /**
   * 이메일로 가입한다. 가입하면 바로 로그인된다. 늘 일반 회원으로 만든다.
   * 이메일이 본인 것인지는 확인하지 않는다 (메일을 보내지 않는다). 그래서 관리자로 정해 둔 이메일은 여기서 가입할 수 없고 구글로만 들어온다.
   */
  async signup(input: SignupInput, ip: string): Promise<LoginResponse> {
    if (!this.config.signup) throw new ApiError("FORBIDDEN", "지금은 가입을 받지 않습니다.");
    const email = input.email.trim().toLowerCase();
    if (this.config.superAdminEmails.includes(email)) throw new ApiError("VALIDATION", "이 이메일은 구글 계정으로 로그인해 주세요.");
    if (await this.findByEmail(email)) throw new ApiError("CONFLICT", "이미 가입된 이메일입니다. 로그인해 주세요.");
    this.countSignup(ip);
    const row = { id: newId("u"), email, name: input.name.trim(), passwordHash: await hashPassword(input.password), googleSub: null, adminRole: null };
    try {
      await this.db.insert(accounts).values(row);
    } catch (e) {
      if (isDuplicate(e)) throw new ApiError("CONFLICT", "이미 가입된 이메일입니다. 로그인해 주세요.");
      throw e;
    }
    return this.issue(row, input.remember !== false);
  }

  /**
   * 구글 계정으로 로그인한다. 처음이면 계정을 만든다.
   * - 같은 이메일로 먼저 가입한 계정이 있으면 그 계정에 잇는다. 이때 예전 비밀번호와 로그인은 지운다:
   *   이메일 가입은 본인 확인을 하지 않으므로, 남이 먼저 만들어 둔 계정일 수 있다. 구글이 이메일 주인을 확인해 준 쪽만 남긴다.
   * - 관리자로 정해 둔 이메일(SUPER_ADMIN_EMAILS)이면 최고 관리자로 만든다.
   */
  async googleLogin(credential: unknown, remember = true): Promise<LoginResponse> {
    if (!this.google) throw new ApiError("VALIDATION", "구글 로그인이 켜져 있지 않습니다.");
    if (typeof credential !== "string" || !credential) throw new ApiError("VALIDATION", "구글 로그인 정보를 보내 주세요.");
    const who = await this.google(credential);
    const makeAdmin = this.config.superAdminEmails.includes(who.email);

    const row = await this.db.transaction(async (tx) => {
      let [found] = await tx.select().from(accounts).where(eq(accounts.googleSub, who.sub)).for("update");
      if (!found) {
        const [sameEmail] = await tx
          .select()
          .from(accounts)
          .where(sql`lower(${accounts.email}) = ${who.email}`)
          .for("update");
        if (sameEmail) {
          await tx.delete(authSessions).where(eq(authSessions.accountId, sameEmail.id));
          [found] = await tx.update(accounts).set({ googleSub: who.sub, passwordHash: null }).where(eq(accounts.id, sameEmail.id)).returning();
        } else {
          [found] = await tx.insert(accounts).values({ id: newId("u"), email: who.email, name: who.name, passwordHash: null, googleSub: who.sub, adminRole: null }).returning();
        }
      }
      if (makeAdmin && found!.adminRole !== "SUPER_ADMIN") {
        [found] = await tx.update(accounts).set({ adminRole: "SUPER_ADMIN" }).where(eq(accounts.id, found!.id)).returning();
      }
      return found!;
    });
    return this.issue(row, remember);
  }

  /**
   * Authorization 헤더의 토큰으로 지금 로그인을 찾는다. 없거나 만료되었으면 null.
   * 로그인 유지(remember)면 쓰는 동안 만료 시각을 뒤로 민다: 남은 기간이 절반 아래로 내려가면 다시 처음 길이로 늘린다.
   * 그래서 꾸준히 쓰는 사람은 다시 로그인하지 않는다.
   */
  async session(authorization: string | undefined): Promise<SessionInfo | null> {
    const token = bearerToken(authorization);
    if (!token) return null;
    const tokenHash = hashToken(token);
    const now = Date.now();
    const [row] = await this.db
      .select({ id: accounts.id, name: accounts.name, email: accounts.email, adminRole: accounts.adminRole, expiresAt: authSessions.expiresAt, remember: authSessions.remember })
      .from(authSessions)
      .innerJoin(accounts, eq(authSessions.accountId, accounts.id))
      .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, new Date(now))));
    if (!row) return null;
    let expiresAt = row.expiresAt;
    const lifetime = this.lifetimeMs(true);
    if (row.remember && expiresAt.getTime() - now < lifetime / 2) {
      expiresAt = new Date(now + lifetime);
      await this.db.update(authSessions).set({ expiresAt }).where(eq(authSessions.tokenHash, tokenHash));
    }
    return { account: { id: row.id, name: row.name, email: row.email, adminRole: row.adminRole }, expiresAt: expiresAt.toISOString() };
  }

  /** Authorization 헤더의 토큰으로 계정을 찾는다. 없거나 만료되었으면 null */
  async authenticate(authorization: string | undefined): Promise<AuthAccount | null> {
    return (await this.session(authorization))?.account ?? null;
  }

  async logout(authorization: string | undefined): Promise<void> {
    const token = bearerToken(authorization);
    if (token) await this.db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)));
  }
}
