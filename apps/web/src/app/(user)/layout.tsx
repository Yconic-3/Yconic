import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "말벗핏 — 말로 하는 운동 안내",
  description: "화면을 보지 않아도 말로 운동을 찾고 구간별 음성 안내를 들으며 운동할 수 있습니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbf7ef",
};

/** 사용자 화면 영역. 바탕색·글자 크기·초점 표시는 globals.css의 .user-root 안에서만 적용된다. */
export default function UserLayout({ children }: { children: ReactNode }) {
  return <div className="user-root">{children}</div>;
}
