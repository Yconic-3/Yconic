"use client";

import type { AdminUser } from "@yconic/shared-types";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createAdminApi, getApiMode, type AdminApi, type ApiMode } from "./api";
import { adminUserOf, readSignedInAccount, signOut, type SignedInAccount } from "@/mock/auth";
import { resetMockStorage } from "@/mock/storage";
import { createIndexedDbVideoStore } from "@/mock/video-store";

interface SessionValue {
  /** 브라우저 저장소를 읽어 로그인 여부가 확정되었는지 */
  ready: boolean;
  /** 로그인한 계정 (일반 회원일 수도 있다) */
  account: SignedInAccount | null;
  /** 관리자 계정으로 로그인했을 때의 관리자. 일반 회원이거나 로그인 전이면 null */
  user: AdminUser | null;
  api: AdminApi;
  mode: ApiMode;
  logout(): void;
  /** 모의 데이터를 처음 상태로 되돌린다 (모의 모드 전용) */
  resetData(): void;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * 관리자 화면의 로그인 상태.
 * 로그인은 사용자 화면과 같은 /login 페이지에서 한다 (src/mock/auth.ts).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<SignedInAccount | null>(null);
  const [ready, setReady] = useState(false);
  const user = useMemo(() => adminUserOf(account), [account]);
  const userRef = useRef<AdminUser | null>(null);
  userRef.current = user;

  const mode = getApiMode();
  const [apiKey, setApiKey] = useState(0);
  const api = useMemo(() => createAdminApi(() => userRef.current), [apiKey]);

  useEffect(() => {
    setAccount(readSignedInAccount());
    setReady(true);
  }, []);

  const logout = useCallback(() => {
    signOut();
    setAccount(null);
  }, []);

  const resetData = useCallback(() => {
    resetMockStorage();
    void createIndexedDbVideoStore()
      .clear()
      .catch(() => undefined)
      .finally(() => setApiKey((k) => k + 1));
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ ready, account, user, api, mode, logout, resetData }),
    [ready, account, user, api, mode, logout, resetData],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession은 SessionProvider 안에서만 사용할 수 있습니다.");
  return v;
}

/** 로그인된 상태에서만 쓰는 페이지용. AppShell이 비로그인 접근을 막으므로 user는 항상 있다. */
export function useAdmin(): { user: AdminUser; api: AdminApi } {
  const { user, api } = useSession();
  if (!user) throw new Error("로그인이 필요합니다.");
  return { user, api };
}
