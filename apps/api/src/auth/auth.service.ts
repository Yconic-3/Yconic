import { Inject, Injectable } from "@nestjs/common";
import { accounts, authSessions, type Database } from "@yconic/database";
import { verifyPassword } from "@yconic/database/password";
import type { AuthAccount, LoginResponse } from "@yconic/shared-types";
import { and, eq, gt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "../common/errors";
import type { ApiConfig } from "../config";
import { CONFIG, DB } from "../tokens";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function bearerToken(header: string | undefined): string | null {
  const m = header ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
  return m ? m[1]!.trim() : null;
}

/** 로그인과 로그인 유지 토큰. 토큰 원문은 저장하지 않고 해시만 저장한다. */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: ApiConfig,
  ) {}

  async login(email: unknown, password: unknown): Promise<LoginResponse> {
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      throw new ApiError("VALIDATION", "이메일과 비밀번호를 모두 입력해 주세요.");
    }
    const [row] = await this.db
      .select()
      .from(accounts)
      .where(sql`lower(${accounts.email}) = ${email.trim().toLowerCase()}`);
    // 이메일이 없는 경우와 비밀번호가 틀린 경우를 구분해서 알려 준다 (시연 단계의 화면 문구와 맞춤).
    if (!row) throw new ApiError("UNAUTHORIZED", "등록되지 않은 이메일입니다.");
    if (!(await verifyPassword(password, row.passwordHash))) throw new ApiError("UNAUTHORIZED", "비밀번호가 맞지 않습니다.");

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.config.sessionDays * 24 * 60 * 60 * 1000);
    await this.db.insert(authSessions).values({ tokenHash: hashToken(token), accountId: row.id, expiresAt });
    return { token, expiresAt: expiresAt.toISOString(), account: { id: row.id, name: row.name, email: row.email, adminRole: row.adminRole } };
  }

  /** Authorization 헤더의 토큰으로 계정을 찾는다. 없거나 만료되었으면 null */
  async authenticate(authorization: string | undefined): Promise<AuthAccount | null> {
    const token = bearerToken(authorization);
    if (!token) return null;
    const [row] = await this.db
      .select({ id: accounts.id, name: accounts.name, email: accounts.email, adminRole: accounts.adminRole })
      .from(authSessions)
      .innerJoin(accounts, eq(authSessions.accountId, accounts.id))
      .where(and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, new Date())));
    return row ?? null;
  }

  async logout(authorization: string | undefined): Promise<void> {
    const token = bearerToken(authorization);
    if (token) await this.db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)));
  }
}
