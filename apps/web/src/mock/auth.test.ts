import { adminUserOfAccount } from "@yconic/shared-types";
import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth";
import { MOCK_ACCOUNTS, verifyCredentials } from "./auth";

describe("모의 로그인", () => {
  it("맞는 이메일·비밀번호면 계정을 돌려주고 비밀번호는 빼고 준다", () => {
    const result = verifyCredentials("member@example.com", "member1234");
    expect(result).toMatchObject({ id: "u-member", name: "체험 회원", adminRole: null });
    expect(result).not.toHaveProperty("password");
  });

  it("이메일은 대소문자와 앞뒤 빈칸을 가리지 않는다", () => {
    expect(verifyCredentials("  Member@Example.com ", "member1234")).toMatchObject({ id: "u-member" });
  });

  it("틀린 경우를 구분해서 알려 준다", () => {
    expect(verifyCredentials("", "")).toBe("EMPTY");
    expect(verifyCredentials("nobody@example.com", "x")).toBe("NOT_FOUND");
    expect(verifyCredentials("member@example.com", "wrong")).toBe("WRONG_PASSWORD");
  });

  it("관리자 계정은 관리자 사용자와 이어진다", () => {
    const approver = verifyCredentials("approver@example.com", "approver1234");
    expect(adminUserOfAccount(typeof approver === "string" ? null : approver)?.role).toBe("APPROVER");
    const member = verifyCredentials("member@example.com", "member1234");
    expect(adminUserOfAccount(typeof member === "string" ? null : member)).toBeNull();
  });

  it("모든 관리자 역할에 로그인할 계정이 있다", () => {
    const roles = MOCK_ACCOUNTS.map((a) => a.adminRole).filter(Boolean);
    expect(new Set(roles)).toEqual(new Set(["EDITOR", "APPROVER", "SUPER_ADMIN", "VIEWER"]));
  });
});

describe("로그인 뒤 돌아갈 주소", () => {
  it("이 사이트 안의 주소만 받는다", () => {
    expect(safeNextPath("/admin")).toBe("/admin");
    expect(safeNextPath("/exercises/c-neck")).toBe("/exercises/c-neck");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
