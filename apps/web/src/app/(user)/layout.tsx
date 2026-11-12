import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// 제목은 두지 않는다. 사용자 화면은 화면마다 틀(AssistantApp)이나 로그인 페이지가 직접 <title>을 그린다.
export const metadata: Metadata = {
  description: "말로 찾고, 듣고 따라 하는 운동. 화면을 보지 않아도 단계별 음성 안내를 들으며 운동할 수 있습니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1115",
};

// 시안 D 글꼴은 KoddiUD 온고딕(public/fonts, globals.css). 글자가 없을 때를 위한 예비 글꼴만 불러온다.
const FONTS_URL = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;800&display=swap";

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
