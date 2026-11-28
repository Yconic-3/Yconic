import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthAccount, AuthConfig, GoogleLoginInput, LoginInput, LoginResponse, SessionInfo } from "@yconic/shared-types";
import { parseSignup } from "../admin/validate";
import { ApiError } from "../common/errors";
import { AuthService } from "./auth.service";
import { AuthGuard, CurrentAccount, type AuthedRequest } from "./guards";

/** Cloudflare를 거쳐 들어온 요청인지 (임시 공개 링크). 이 컴퓨터에서 직접 연 요청에는 이 헤더가 없다 */
export function viaPublicLink(headers: Record<string, string | string[] | undefined>): boolean {
  return !!headers["cf-connecting-ip"] || !!headers["cf-ray"];
}

/** 요청을 보낸 곳. 프록시(Vercel, 웹앱)를 거쳐 오므로 x-forwarded-for 의 첫 값을 먼저 본다 */
function clientIp(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.ip || "?";
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  login(@Body() body: Partial<LoginInput>, @Req() req: { headers: Record<string, string | string[] | undefined> }): Promise<LoginResponse> {
    return this.auth.login(body?.email, body?.password, viaPublicLink(req.headers), body?.remember !== false);
  }

  @Post("signup")
  signup(@Body() body: unknown, @Req() req: { headers: Record<string, string | string[] | undefined>; ip?: string }): Promise<LoginResponse> {
    return this.auth.signup(parseSignup(body), clientIp(req));
  }

  @Post("google")
  @HttpCode(200)
  google(@Body() body: Partial<GoogleLoginInput>): Promise<LoginResponse> {
    return this.auth.googleLogin(body?.credential, body?.remember !== false);
  }

  @Get("config")
  config(): AuthConfig {
    return this.auth.authConfig();
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentAccount() account: AuthAccount): AuthAccount {
    return account;
  }

  /** 로그인이 아직 유효한지와 언제까지인지. 로그인 유지면 여기서 기간이 늘어난다 */
  @Get("session")
  async session(@Req() req: { headers: Record<string, string | string[] | undefined> }): Promise<SessionInfo> {
    const authorization = req.headers.authorization;
    const info = await this.auth.session(Array.isArray(authorization) ? authorization[0] : authorization);
    if (!info) throw new ApiError("UNAUTHORIZED", "로그인이 필요합니다. 다시 로그인해 주세요.");
    return info;
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: AuthedRequest): Promise<void> {
    await this.auth.logout(req.headers.authorization);
  }
}
