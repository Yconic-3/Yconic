import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/admin/components/app-shell";
import { SessionProvider } from "@/admin/lib/session";

export const metadata: Metadata = {
  title: { default: "Yconic 관리자", template: "%s · Yconic 관리자" },
  description: "시각장애인 AI 운동 지원 플랫폼 콘텐츠 관리",
};

/**
 * 관리자 화면 영역 (/admin).
 * 지금은 모의 로그인이다. 실제 인증이 붙으면 /admin 아래 전체를 서버에서 막아야 한다.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-root">
      <SessionProvider>
        <AppShell>{children}</AppShell>
      </SessionProvider>
    </div>
  );
}
