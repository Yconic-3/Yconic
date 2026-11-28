import { redirect } from "next/navigation";

/** 관리자 화면의 첫 화면은 콘텐츠 목록이다. 대시보드는 없앴다 (docs/decisions/0023) */
export default function AdminHome() {
  redirect("/admin/contents");
}
