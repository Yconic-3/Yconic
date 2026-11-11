import { randomBytes } from "node:crypto";

/** 접두어가 붙은 새 ID (예: c-mwbx3k2a-9f3e1c). 접두어로 무엇의 ID인지 알 수 있다. */
export function newId(prefix: "c" | "s" | "v" | "j" | "a"): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}
