import { Body, Controller, Get, HttpCode, Inject, Post, Req } from "@nestjs/common";
import type { TtsConfig, TtsRequest, TtsResponse } from "@yconic/shared-types";
import { TtsService } from "./tts.service";

type RequestLike = { headers: Record<string, string | string[] | undefined>; ip?: string };

/** 요청을 보낸 곳. 프록시(Vercel, 웹앱)를 거쳐 오므로 x-forwarded-for 의 첫 값을 먼저 본다 */
function clientIp(req: RequestLike): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.ip || "?";
}

/** 서버 목소리 (shared-types/tts.ts). 로그인 없이 쓴다 (운동 안내는 로그인하지 않아도 듣는다) */
@Controller("tts")
export class TtsController {
  constructor(@Inject(TtsService) private readonly tts: TtsService) {}

  @Get("config")
  config(): TtsConfig {
    return this.tts.info();
  }

  @Post()
  @HttpCode(200)
  speak(@Body() body: Partial<TtsRequest>, @Req() req: RequestLike): Promise<TtsResponse> {
    return this.tts.urlFor(body?.text, clientIp(req));
  }
}
