import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { AdminApiErrorBody, AdminApiErrorCode } from "@yconic/shared-types";
import type { Response } from "express";

/** 화면에 그대로 보여 줄 수 있는 오류. 응답 본문은 { code, message } 형식이다 (shared-types AdminApiErrorBody). */
export class ApiError extends Error {
  constructor(
    public readonly code: AdminApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const STATUS: Record<AdminApiErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNKNOWN: 500,
};

function codeForStatus(status: number): AdminApiErrorCode {
  if (status === 400 || status === 413 || status === 415 || status === 422) return "VALIDATION";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  return "UNKNOWN";
}

const DEFAULT_MESSAGE: Partial<Record<number, string>> = {
  404: "요청한 주소를 찾을 수 없습니다.",
  413: "파일이 너무 큽니다. 영상은 2GB 이하여야 합니다.",
};

/** 모든 오류를 { code, message } 형식으로 바꾼다. 예상하지 못한 오류는 내용을 숨기고 서버 기록에만 남긴다. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let body: AdminApiErrorBody;
    if (error instanceof ApiError) {
      status = STATUS[error.code];
      body = { code: error.code, message: error.message };
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      body = { code: codeForStatus(status), message: DEFAULT_MESSAGE[status] ?? error.message };
    } else {
      console.error("[api] 처리하지 못한 오류:", error);
      body = { code: "UNKNOWN", message: "서버에서 오류가 났습니다. 잠시 뒤 다시 시도해 주세요." };
    }
    res.status(status).json(body);
  }
}

export function notFound(what: string): ApiError {
  return new ApiError("NOT_FOUND", `${what}을(를) 찾을 수 없습니다.`);
}
