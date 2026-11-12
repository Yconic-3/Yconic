"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { readSignedInAccount, safeNextPath, signOut, type SignedInAccount } from "@/lib/auth";
import { accountLabel, LoginForm } from "@/user/components/login-form";
import { Brand } from "@/user/components/ui";

/**
 * 로그인 화면 (/login). 관리자 화면이 로그인이 필요할 때 ?next=/admin… 으로 보낸다.
 * 사용자 화면 안에서의 로그인은 내 계정(/account)이 맡는다. 두 화면이 같은 LoginForm을 쓴다.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const adminOnly = params.get("reason") === "admin-only";
  const goingToAdmin = next.startsWith("/admin");

  const [current, setCurrent] = useState<SignedInAccount | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setCurrent(readSignedInAccount());
    headingRef.current?.focus();
  }, []);

  function finish(account: SignedInAccount) {
    // 관리자 화면으로 가려는데 일반 회원이면 들여보내지 않고 안내한다.
    if (goingToAdmin && !account.adminRole) {
      setCurrent(account);
      setNotice("관리자 화면은 관리자 계정으로만 들어갈 수 있습니다. 아래 관리자 계정으로 다시 로그인해 주세요.");
      return;
    }
    router.replace(next);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <title>{goingToAdmin ? "관리자 로그인 — 소리벗" : "로그인 — 소리벗"}</title>
      <header className="border-b-2 border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
          <Brand />
          <Link href="/" className="ml-auto text-[20px] font-bold underline decoration-2 underline-offset-[5px]">
            운동하기 홈으로
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto box-border flex w-full max-w-[680px] flex-1 flex-col gap-12 px-4 pb-16 pt-11">
        <div className="flex flex-col gap-2">
          <span className="text-[17px] font-bold text-accent">{goingToAdmin ? "관리자 화면" : "운동하기"}</span>
          <h1 ref={headingRef} tabIndex={-1} className="m-0 text-[44px] font-extrabold leading-tight max-[960px]:text-[30px]">
            {goingToAdmin ? "관리자 로그인" : "로그인"}
          </h1>
          <p className="m-0 text-[18px] text-ink-2">
            {goingToAdmin ? "관리자 계정으로 로그인하면 관리자 화면으로 이동합니다." : "로그인하면 원래 보던 화면으로 돌아갑니다."}
          </p>
        </div>

        {(notice || adminOnly || (goingToAdmin && current && !current.adminRole)) && (
          <p role="alert" className="m-0 rounded-2xl border-2 border-warn bg-warn-tint px-[18px] py-4 text-[18px] text-warn-ink">
            {notice ?? "지금 로그인한 계정은 일반 회원이라 관리자 화면에 들어갈 수 없습니다. 관리자 계정으로 로그인해 주세요."}
          </p>
        )}

        {current && (
          <p className="m-0 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-control bg-panel px-5 py-4 text-[19px]">
            <span>
              지금 <strong>{current.name}</strong>({accountLabel(current)})으로 로그인되어 있습니다.
            </span>
            <button
              type="button"
              onClick={() => {
                signOut();
                setCurrent(null);
                setNotice(null);
              }}
              className="font-bold text-info underline decoration-2 underline-offset-[5px]"
            >
              로그아웃
            </button>
          </p>
        )}

        <LoginForm onSignedIn={finish} />
      </main>
    </div>
  );
}
