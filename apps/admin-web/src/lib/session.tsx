"use client";

import type { AdminUser } from "@yconic/shared-types";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createAdminApi, getApiMode, type AdminApi, type ApiMode } from "./api";
import { MOCK_USERS } from "./api/mock/seed";
import { resetMockStorage } from "./api/mock/storage";

const SESSION_KEY = "yconic.admin.session-user-id";

interface SessionValue {
  /** 브라우저 저장소를 읽어 로그인 여부가 확정되었는지 */
  ready: boolean;
  user: AdminUser | null;
  api: AdminApi;
  mode: ApiMode;
  /** 모의 모드에서 고를 수 있는 계정 목록 */
  users: AdminUser[];
  login(userId: string): void;
  logout(): void;
  /** 모의 데이터를 처음 상태로 되돌린다 (모의 모드 전용) */
  resetData(): void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [ready, setReady] = useState(false);
  const userRef = useRef<AdminUser | null>(null);
  userRef.current = user;

  const mode = getApiMode();
  const users = mode === "mock" ? MOCK_USERS : [];
  const [apiKey, setApiKey] = useState(0);
  const api = useMemo(() => createAdminApi(() => userRef.current), [apiKey]);

  useEffect(() => {
    try {
      const id = window.localStorage.getItem(SESSION_KEY);
      setUser(users.find((u) => u.id === id) ?? null);
    } catch {
      setUser(null);
    }
    setReady(true);
    // users는 모드에 따라 고정된 목록이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    (userId: string) => {
      const u = users.find((x) => x.id === userId) ?? null;
      setUser(u);
      try {
        if (u) window.localStorage.setItem(SESSION_KEY, u.id);
      } catch {
        // 저장 실패는 무시 (새로 고치면 로그아웃됨)
      }
    },
    [users],
  );

  const logout = useCallback(() => {
    setUser(null);
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // 무시
    }
  }, []);

  const resetData = useCallback(() => {
    resetMockStorage();
    setApiKey((k) => k + 1);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ ready, user, api, mode, users, login, logout, resetData }),
    [ready, user, api, mode, users, login, logout, resetData],
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
