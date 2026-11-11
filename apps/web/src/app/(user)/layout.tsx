import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "말벗핏 — 대화형 음성 운동 비서",
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
