import type { ReactNode } from "react";
import { AssistantApp } from "@/user/components/assistant-app";

/**
 * 처음 화면(/)과 운동 화면(/exercises/[id])이 함께 쓰는 틀.
 * 비서 화면을 레이아웃에 두어서, 운동을 골라 주소가 바뀌어도 마이크 듣기와 대화 기록이 끊기지 않는다.
 * 어느 화면을 보여 줄지는 AssistantApp이 주소를 보고 정한다. 각 페이지는 내용 없이 주소만 만든다.
 */
export default function AssistantLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AssistantApp />
      {children}
    </>
  );
}
