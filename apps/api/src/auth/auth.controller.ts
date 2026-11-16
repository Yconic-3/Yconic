import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthAccount, LoginInput, LoginResponse } from "@yconic/shared-types";
import { AuthService } from "./auth.service";
import { AuthGuard, CurrentAccount, type AuthedRequest } from "./guards";

/** Cloudflare를 거쳐 들어온 요청인지 (임시 공개 링크). 이 컴퓨터에서 직접 연 요청에는 이 헤더가 없다 */
export function viaPublicLink(headers: Record<string, string | string[] | undefined>): boolean {
  return !!headers["cf-connecting-ip"] || !!headers["cf-ray"];
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  login(@Body() body: Partial<LoginInput>, @Req() req: { headers: Record<string, string | string[] | undefined> }): Promise<LoginResponse> {
    return this.auth.login(body?.email, body?.password, viaPublicLink(req.headers));
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentAccount() account: AuthAccount): AuthAccount {
    return account;
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: AuthedRequest): Promise<void> {
    await this.auth.logout(req.headers.authorization);
  }
}
