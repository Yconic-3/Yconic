"use client";

import { usePathname, useRouter } from "next/navigation";
import { CONTENT_STATUS_LABELS, type ContentStatus, type MyContent } from "@yconic/shared-types";
import { Button, ICONS, InfoBox } from "./ui";

/** 올린 사람에게 보여 줄 상태 설명 */
export function creatorStatusNote(c: Pick<MyContent, "status" | "reviewComment">): string {
  const notes: Record<ContentStatus, string> = {
    DRAFT: "초안입니다. 안내를 확인하고 검수를 요청해 주세요.",
    IN_REVIEW: "운영자 검수를 기다리고 있습니다.",
    CHANGES_REQUESTED: `검수 의견: ${c.reviewComment ?? "운영자가 수정을 요청했습니다."}`,
    APPROVED: "승인되었습니다. 운영자가 곧 공개합니다.",
    PUBLISHED: "운동하기 화면에 나타납니다.",
    ARCHIVED: "보관되었습니다. 운동하기 화면에 나오지 않습니다.",
  };
  return notes[c.status];
}

export function creatorStatusLine(c: Pick<MyContent, "status" | "reviewComment">): string {
  return `상태: ${CONTENT_STATUS_LABELS[c.status]}. ${creatorStatusNote(c)}`;
}

/** 로그인이 필요한 화면에서 로그인 전이면 보여 준다. 로그인하면 이 화면으로 돌아온다 */
export function LoginRequired() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  return (
    <InfoBox>
      <h2 className="m-0 text-[24px] font-extrabold">로그인한 뒤에 쓸 수 있는 기능입니다</h2>
      <p className="m-0 text-[18px] text-ink-2">
        콘텐츠 올리기와 내 강의는 로그인해야 쓸 수 있습니다. 운동 찾기와 안내 듣기는 로그인하지 않아도 쓸 수 있습니다.
      </p>
      <Button tone="info" size="lg" icon={ICONS.login} onClick={() => router.push(`/account?next=${encodeURIComponent(pathname)}`)} className="!min-h-[72px] !text-[23px]">
        로그인하러 가기
      </Button>
    </InfoBox>
  );
}
