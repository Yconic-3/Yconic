"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import type { CourseId, GuideLevel, LearningProfile, MovementId } from "@yconic/shared-types";
import type { PublishedExercise } from "./api";
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
  /** 내 강의. 로그인하지 않았으면 null */
  learnedCourses: CourseId[] | null;
  /** 내 강의를 바꾼다 (저장까지) */
  setLearnedCourses(courseIds: CourseId[]): Promise<void>;
  /** 내 동작(강의로 배운 동작, 직접 알린 동작, 여러 번 따라 한 동작). 로그인하지 않았으면 null */
  learning: LearningProfile | null;
  /** 동작 하나를 배웠다고(또는 아니라고) 기록한다. terms는 강사에게 배운 용어 */
  setMovementKnown(id: MovementId, known: boolean, terms?: string): Promise<void>;
  /** '방금 안내'에 남기고 소리 내어 읽는다. 끝까지 읽으면 true */
  say(text: string, audioUrl?: string | null): Promise<boolean>;
  setPage(info: PageInfo | null): void;
  /** 공개 운동 영상 전체. 불러오기 전에는 null */
  exercises: PublishedExercise[] | null;
  /** 이 운동을 짧게(영상 속 동작을 모두 배움) 또는 자세하게 안내하는지 */
  levelOf(e: Pick<PublishedExercise, "segments">): GuideLevel;
  /** 시청 화면으로 간다. autoplay면 안내를 바로 시작한다 */
  openExercise(id: string, autoplay: boolean): void;
  /** 다음 화면이 스스로 안내를 읽어도 되는지 (에이전트가 이미 말했으면 false). 한 번 읽으면 다시 true */
  shouldAnnounce(): boolean;
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
