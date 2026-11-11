import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthAccount, LoginInput, LoginResponse } from "@yconic/shared-types";
import { AuthService } from "./auth.service";
import { AuthGuard, CurrentAccount, type AuthedRequest } from "./guards";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  login(@Body() body: Partial<LoginInput>): Promise<LoginResponse> {
    return this.auth.login(body?.email, body?.password);
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
