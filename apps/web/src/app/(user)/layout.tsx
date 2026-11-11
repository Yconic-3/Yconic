import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// 제목은 두지 않는다. 사용자 화면은 운동 이름에 따라 페이지가 직접 <title>을 그린다 (AssistantApp, 로그인 페이지).
export const metadata: Metadata = {
  description: "화면을 보지 않아도 말로 운동을 찾고 구간별 음성 안내를 들으며 운동할 수 있습니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbf7ef",
};

// 시안 B 글꼴. 불러오지 못해도 시스템 글꼴로 그대로 쓸 수 있다.
const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Noto+Serif+KR:wght@700;900&family=Work+Sans:wght@400;600;700;900&display=swap";

/** 사용자 화면 영역. 바탕색·글자 크기·초점 표시는 globals.css의 .user-root 안에서만 적용된다. */
export default function UserLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={FONTS_URL} precedence="default" />
      <div className="user-root">{children}</div>
    </>
  );
}
