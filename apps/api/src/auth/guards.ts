import { createParamDecorator, Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { adminUserOfAccount, type AdminUser, type AuthAccount } from "@yconic/shared-types";
import type { Request } from "express";
import { ApiError } from "../common/errors";
import { AuthService } from "./auth.service";

export type AuthedRequest = Request & { account?: AuthAccount };

/** 로그인한 사람만 통과시킨다. 통과하면 req.account 에 계정이 들어간다. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const account = await this.auth.authenticate(req.headers.authorization);
    if (!account) throw new ApiError("UNAUTHORIZED", "로그인이 필요합니다. 다시 로그인해 주세요.");
    req.account = account;
    return true;
  }
}

/** 관리자 계정만 통과시킨다. AuthGuard 다음에 쓴다. 역할별 세부 권한은 서비스에서 shared-types 권한표로 검사한다. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!adminUserOfAccount(req.account ?? null)) throw new ApiError("FORBIDDEN", "관리자 계정만 쓸 수 있습니다.");
    return true;
  }
}

export const CurrentAccount = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthAccount => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().account!;
});

/** 관리자 화면 요청에서 지금 관리자 (AdminGuard를 통과한 뒤에만 쓴다) */
export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): AdminUser => {
  return adminUserOfAccount(ctx.switchToHttp().getRequest<AuthedRequest>().account ?? null)!;
});
