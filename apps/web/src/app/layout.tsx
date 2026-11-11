import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * 한 웹앱 안에 두 화면이 있다 (docs/decisions/0004).
 * - 사용자 화면: /        → app/(user), 코드는 src/user
 * - 관리자 화면: /admin   → app/admin, 코드는 src/admin
 * 두 화면이 함께 쓰는 모의 백엔드는 src/mock에 있다.
 */
export const metadata: Metadata = {
  title: "말벗핏",
  description: "화면을 보지 않아도 말로 운동을 찾고 구간별 음성 안내를 들으며 운동할 수 있습니다.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
