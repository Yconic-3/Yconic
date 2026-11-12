"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import type { SignedInAccount } from "@/lib/auth";

/**
 * 사용자 화면의 틀(UserShell)과 그 안의 페이지(내 계정, 내 강의, 내 콘텐츠 …)가 주고받는 것.
 * 틀이 머리말·방금 안내·음성 패널·메뉴를 그리고, 페이지는 본문만 그린다.
 * 페이지가 바뀌어도 틀은 그대로라 마이크 듣기와 대화가 끊기지 않는다.
 */

/** 운동하기(consume) 또는 콘텐츠 올리기(supply) */
export type ShellMode = "consume" | "supply";

export interface PageInfo {
  mode: ShellMode;
  /** 화면 큰 제목 (h1) */
  title: string;
  /** "이렇게 말해 보세요" 예시 */
  chips?: string[];
}

/** 페이지가 먼저 처리할 말. 처리했으면 true */
export type PageCommandHandler = (text: string) => boolean;

export interface ShellApi {
  account: SignedInAccount | null;
  /** 로그인·로그아웃 뒤 계정을 다시 읽는다 */
  refreshAccount(): void;
  /** '방금 안내'에 남기고 소리 내어 읽는다. 끝까지 읽으면 true */
  say(text: string, audioUrl?: string | null): Promise<boolean>;
  setPage(info: PageInfo | null): void;
  setPageCommands(handler: PageCommandHandler | null): void;
}

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("UserShell 안에서만 쓸 수 있습니다.");
  return shell;
}

/** 이 페이지의 제목·예시 말을 틀에 알린다 */
export function usePage(info: PageInfo) {
  const { setPage } = useShell();
  const { mode, title } = info;
  // 예시 말 배열은 렌더마다 새로 만들어지므로 글자로 바꿔 비교한다
  const chipsKey = (info.chips ?? []).join("\n");
  useEffect(() => {
    setPage({ mode, title, chips: chipsKey ? chipsKey.split("\n") : undefined });
    return () => setPage(null);
  }, [mode, title, chipsKey, setPage]);
}

/** 이 페이지에서만 쓰는 음성 명령을 틀에 등록한다. handler는 렌더마다 최신 것을 쓴다 */
export function usePageCommands(handler: PageCommandHandler) {
  const { setPageCommands } = useShell();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    setPageCommands((text) => ref.current(text));
    return () => setPageCommands(null);
  }, [setPageCommands]);
}
