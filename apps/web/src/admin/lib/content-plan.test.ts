import type { AdminRole, ContentStatus } from "@yconic/shared-types";
import { describe, expect, it } from "vitest";
import { SELF_PUBLISH_BLOCKED, planActions } from "./content-plan";

const who = (id: string, role: AdminRole) => ({ id, role });
const content = (status: ContentStatus, createdBy = "u-member", submittedBy: string | null = null) => ({ status, createdBy, submittedBy });
const labels = (list: ReturnType<typeof planActions>) => list.map((p) => p.label);

describe("관리자 화면의 공개 단추 (0023)", () => {
  it("승인권자와 최고 관리자는 남이 올린 비공개 영상을 바로 공개할 수 있다", () => {
    for (const role of ["APPROVER", "SUPER_ADMIN"] as const) {
      for (const status of ["DRAFT", "CHANGES_REQUESTED"] as const) {
        const [first, ...rest] = planActions(who("u-x", role), content(status));
        expect(first).toMatchObject({ action: "PUBLISH_NOW", label: "공개하기", blocked: null });
        expect(rest).toEqual([]);
      }
    }
  });

  it("이미 승인된 것은 공개만 하면 된다", () => {
    expect(planActions(who("u-x", "APPROVER"), content("APPROVED"))[0]).toMatchObject({ action: "PUBLISH", label: "공개하기" });
  });

  it("공개 요청이 들어온 것은 공개하거나 돌려보낸다", () => {
    expect(labels(planActions(who("u-x", "APPROVER"), content("IN_REVIEW", "u-member", "u-member")))).toEqual(["공개하기", "돌려보내기"]);
  });

  it("공개 중이면 비공개로 돌릴 수 있다", () => {
    expect(planActions(who("u-x", "APPROVER"), content("PUBLISHED"))).toEqual([{ action: "UNPUBLISH", label: "비공개로", variant: "secondary", blocked: null }]);
  });

  it("승인권자가 직접 올린 영상은 공개 대신 공개 요청을 보여 준다", () => {
    const [first] = planActions(who("u-a", "APPROVER"), content("DRAFT", "u-a"));
    expect(first).toMatchObject({ action: "SUBMIT_FOR_REVIEW", label: "공개 요청" });
    expect(first!.hint).toContain("다른 승인권자");
  });

  it("승인권자가 직접 공개를 요청한 영상은 공개 단추를 잠그고 이유를 보여 준다", () => {
    const [first] = planActions(who("u-a", "APPROVER"), content("IN_REVIEW", "u-member", "u-a"));
    expect(first).toMatchObject({ action: "PUBLISH_NOW", label: "공개하기", blocked: SELF_PUBLISH_BLOCKED });
  });

  it("최고 관리자는 직접 올린 영상도 바로 공개할 수 있다", () => {
    expect(planActions(who("u-s", "SUPER_ADMIN"), content("DRAFT", "u-s"))[0]).toMatchObject({ action: "PUBLISH_NOW", label: "공개하기", blocked: null });
    expect(planActions(who("u-s", "SUPER_ADMIN"), content("IN_REVIEW", "u-s", "u-s"))[0]).toMatchObject({ action: "PUBLISH_NOW", blocked: null });
  });

  it("편집자는 공개를 요청만 할 수 있고, 조회자는 아무것도 못 한다", () => {
    expect(planActions(who("u-e", "EDITOR"), content("DRAFT"))[0]).toMatchObject({ action: "SUBMIT_FOR_REVIEW", label: "공개 요청" });
    expect(planActions(who("u-e", "EDITOR"), content("PUBLISHED"))).toEqual([]);
    expect(planActions(who("u-e", "EDITOR"), content("IN_REVIEW"))).toEqual([]);
    for (const status of ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"] as const) expect(planActions(who("u-v", "VIEWER"), content(status))).toEqual([]);
  });

  it("고쳐야 할 것이 있거나 저장하지 않았으면 공개와 공개 요청을 잠근다. 비공개로 돌리는 것은 잠그지 않는다", () => {
    expect(planActions(who("u-x", "APPROVER"), content("DRAFT"), "먼저 저장해 주세요.")[0]!.blocked).toBe("먼저 저장해 주세요.");
    expect(planActions(who("u-e", "EDITOR"), content("DRAFT"), "고쳐야 할 것이 2개 있습니다.")[0]!.blocked).toBe("고쳐야 할 것이 2개 있습니다.");
    expect(planActions(who("u-x", "APPROVER"), content("PUBLISHED"), "먼저 저장해 주세요.")[0]!.blocked).toBeNull();
  });

  it("보관한 것은 보관 해제만 보여 준다", () => {
    expect(labels(planActions(who("u-e", "EDITOR"), content("ARCHIVED")))).toEqual(["보관 해제"]);
  });
});
