"use client";

import { ADMIN_ROLE_LABELS, hasPermission, type AdminPermission } from "@yconic/shared-types";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/session";
import { Button } from "./ui";

interface NavItem {
  href: string;
  label: string;
  permission: AdminPermission;
}

const NAV: NavItem[] = [
  { href: "/", label: "대시보드", permission: "content:read" },
  { href: "/contents", label: "운동 영상", permission: "content:read" },
  { href: "/jobs", label: "AI 제작 작업", permission: "job:read" },
  { href: "/audit", label: "감사 로그", permission: "audit:read" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, user, logout, mode, resetData } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (!ready) return;
    if (!user && !isLogin) router.replace("/login");
    if (user && isLogin) router.replace("/");
  }, [ready, user, isLogin, router]);

  if (!ready) {
    return (
      <p className="p-8 text-sm text-slate-500" role="status">
        불러오는 중…
      </p>
    );
  }
  if (isLogin) return <>{children}</>;
  if (!user) return null;

  return (
    <div className="flex min-h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2">
        본문으로 건너뛰기
      </a>
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <Link href="/" className="text-lg font-bold">
            Yconic 관리자
          </Link>
          {mode === "mock" && (
            <p className="mt-1 text-xs text-amber-700" title="백엔드 없이 브라우저 안의 모의 데이터로 동작합니다.">
              모의 데이터 모드
            </p>
          )}
        </div>
        <nav aria-label="주 메뉴" className="flex-1 px-2 py-3">
          <ul className="space-y-1">
            {NAV.filter((n) => hasPermission(user.role, n.permission)).map((n) => {
              const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-3 py-2 text-sm ${active ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-700 hover:bg-slate-100"}`}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-slate-200 px-4 py-3 text-sm">
          <p className="font-medium">{user.name}</p>
          <p className="text-xs text-slate-500">{ADMIN_ROLE_LABELS[user.role]}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={logout}>
              로그아웃
            </Button>
            {mode === "mock" && (
              <Button
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => {
                  if (window.confirm("모의 데이터를 처음 상태로 되돌릴까요? 지금까지 만든 내용이 사라집니다.")) {
                    resetData();
                    router.refresh();
                    window.location.reload();
                  }
                }}
              >
                데이터 초기화
              </Button>
            )}
          </div>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 px-6 py-6">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
