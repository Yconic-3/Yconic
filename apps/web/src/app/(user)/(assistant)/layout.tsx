import type { ReactNode } from "react";
import { AssistantApp } from "@/user/components/assistant-app";

/**
 * 사용자 화면의 모든 주소가 함께 쓰는 틀 (시안 D: 머리말 + 본문 + 음성 패널).
 * 틀을 레이아웃에 두어서, 주소가 바뀌어도 마이크 듣기와 대화가 끊기지 않는다.
 * 운동하기 홈(/)과 운동 화면(/exercises/[id])은 틀이 직접 그리고, 그 밖의 페이지는 본문 자리에 들어간다.
 */
export default function AssistantLayout({ children }: { children: ReactNode }) {
  return <AssistantApp>{children}</AssistantApp>;
}
