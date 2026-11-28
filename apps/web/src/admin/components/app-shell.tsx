"use client";

import { ADMIN_ROLE_LABELS, hasPermission, type AdminPermission } from "@yconic/shared-types";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useSession } from "@/admin/lib/session";
import { Button, LinkButton } from "./ui";

interface NavItem {
  href: string;
  label: string;
  permission: AdminPermission;
}

/**
 * 메뉴는 둘뿐이다 (docs/decisions/0023). 대시보드와 AI 제작 작업 목록은 콘텐츠 목록 안으로 들어갔다:
 * 분석 중인 영상은 콘텐츠 목록 맨 위에 나오고, 작업 내역은 그 옆의 링크로 연다.
 */
const NAV: NavItem[] = [
  { href: "/admin/contents", label: "콘텐츠", permission: "content:read" },
  { href: "/admin/audit", label: "기록", permission: "audit:read" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, account, user, logout, mode, resetData } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";
  const leavingRef = useRef(false);

  // 관리자로 로그인하지 않았으면 공통 로그인 페이지로 보낸다. 로그인 뒤 지금 주소로 돌아온다.
  // 일반 회원으로 로그인한 상태면 관리자 계정이 필요하다는 안내가 함께 나온다.
  useEffect(() => {
    if (!ready || leavingRef.current || isLogin || user) return;
    const reason = account ? "&reason=admin-only" : "";
    router.replace(`/login?next=${encodeURIComponent(pathname)}${reason}`);
  }, [ready, user, account, isLogin, pathname, router]);

  function handleLogout() {
    leavingRef.current = true;
    logout();
    router.replace("/");
  }

  if (!ready) {
    return (
      <p className="p-8 text-sm text-slate-500" role="status">
        불러오는 중…
      </p>
    );
  }
  if (isLogin) return <>{children}</>;
  if (!user) return null;

  const canUpload = hasPermission(user.role, "job:create");
  const uploading = pathname.startsWith("/admin/jobs/new");

  return (
    <div className="min-h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2">
        본문으로 건너뛰기
      </a>
      <header className="sticky top-0 z-30 border-b-2 border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-6">
          {/* 사용자 화면과 같은 상표 (소리벗 로고 + 이름). 관리자 화면임을 글자로 붙인다 */}
          <Link href="/admin/contents" className="flex items-center gap-2" aria-label="소리벗 관리자 콘텐츠 목록">
            <svg aria-hidden="true" width="28" height="28" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="flex-none text-blue-600">
              <path d="M8 20h4l3-9 4 18 4-13 3 6h6" />
            </svg>
            <span className="whitespace-nowrap text-xl font-extrabold tracking-[-0.5px]" aria-hidden>
              소리벗
            </span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700" aria-hidden>
              관리자
            </span>
          </Link>

          <nav aria-label="주 메뉴">
            <ul className="flex items-center gap-1">
              {NAV.filter((n) => hasPermission(user.role, n.permission)).map((n) => {
                const active = pathname.startsWith(n.href) || (n.href === "/admin/contents" && (pathname === "/admin" || pathname.startsWith("/admin/jobs")));
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-xl px-3 py-2 text-[15px] ${active ? "bg-blue-50 font-extrabold text-blue-700" : "font-bold text-slate-600 hover:bg-slate-100"}`}
                    >
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
            {mode === "mock" && (
              <span className="text-xs text-amber-700" title="백엔드 없이 브라우저 안의 모의 데이터로 동작합니다.">
                모의 데이터
                <button
                  type="button"
                  className="ml-1 underline"
                  onClick={() => {
                    if (window.confirm("모의 데이터를 처음 상태로 되돌릴까요? 지금까지 만든 내용이 사라집니다.")) {
                      resetData();
                      router.refresh();
                      window.location.reload();
                    }
                  }}
                >
                  초기화
                </button>
              </span>
            )}
            {canUpload && !uploading && (
              <LinkButton href="/admin/jobs/new" variant="primary">
                <span aria-hidden>＋</span> 영상 올리기
              </LinkButton>
            )}
            <span className="text-right text-xs leading-tight text-slate-500" title={user.email}>
              <span className="block text-sm font-bold text-slate-800">{user.name}</span>
              {ADMIN_ROLE_LABELS[user.role]}
            </span>
            <Link href="/" className="text-sm text-slate-600 hover:text-blue-700 hover:underline">
              사용자 화면
            </Link>
            <Button variant="ghost" className="px-2 py-1 text-sm" onClick={handleLogout}>
              로그아웃
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
