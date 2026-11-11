"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { ADMIN_ROLE_LABELS } from "@yconic/shared-types";
import { DEMO_ACCOUNTS, readSignedInAccount, safeNextPath, signIn, signOut, type SignedInAccount } from "@/lib/auth";
import { Brand, Panel } from "@/user/components/ui";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function accountLabel(a: Pick<SignedInAccount, "adminRole">): string {
  return a.adminRole ? `관리자 · ${ADMIN_ROLE_LABELS[a.adminRole]}` : "일반 회원";
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const adminOnly = params.get("reason") === "admin-only";
  const goingToAdmin = next.startsWith("/admin");

  const [current, setCurrent] = useState<SignedInAccount | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setCurrent(readSignedInAccount());
    headingRef.current?.focus();
  }, []);

  function finish(account: SignedInAccount) {
    // 관리자 화면으로 가려는데 일반 회원이면 들여보내지 않고 안내한다.
    if (goingToAdmin && !account.adminRole) {
      setCurrent(account);
      setError("관리자 화면은 관리자 계정으로만 들어갈 수 있습니다. 아래 관리자 계정으로 다시 로그인해 주세요.");
      return;
    }
    router.replace(next);
  }

  async function attempt(accountEmail: string, accountPassword: string) {
    if (busy) return;
    setBusy(true);
    const result = await signIn(accountEmail, accountPassword);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    finish(result.account);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void attempt(email, password);
  }

  function quickSignIn(accountEmail: string, accountPassword: string) {
    setEmail(accountEmail);
    setPassword(accountPassword);
    void attempt(accountEmail, accountPassword);
  }

  function logout() {
    signOut();
    setCurrent(null);
    setError(null);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <title>{goingToAdmin ? "관리자 로그인 — 말벗핏" : "로그인 — 말벗핏"}</title>
      <header className="border-b-2 border-line bg-bg">
        <div className="mx-auto flex max-w-[980px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-[18px]">
          <Brand />
          <Link href="/" className="ml-auto font-bold text-accent underline underline-offset-4 hover:text-accent-strong">
            처음 화면으로
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto box-border flex w-full max-w-[640px] flex-1 flex-col gap-8 px-4 pb-16 pt-9">
        <div className="flex flex-col gap-3 text-center">
          <h1 ref={headingRef} tabIndex={-1} className="m-0 font-display text-[clamp(30px,6vw,40px)] font-black leading-tight">
            {goingToAdmin ? "관리자 로그인" : "로그인"}
          </h1>
          <p className="m-0 text-ink-3">
            {goingToAdmin ? "관리자 계정으로 로그인하면 관리자 화면으로 이동합니다." : "로그인하면 처음 화면으로 돌아갑니다. 관리자 계정이면 관리자 화면으로 가는 버튼이 생깁니다."}
          </p>
        </div>

        {(adminOnly || (goingToAdmin && current && !current.adminRole)) && !error && (
          <p role="alert" className="m-0 rounded-xl border-2 border-accent-soft bg-accent-tint px-4 py-3.5 text-warn-ink">
            지금 로그인한 계정은 일반 회원이라 관리자 화면에 들어갈 수 없습니다. 관리자 계정으로 로그인해 주세요.
          </p>
        )}

        {current && (
          <p className="m-0 flex flex-wrap items-center gap-3 rounded-xl border-2 border-line bg-surface px-4 py-3.5">
            <span>
              지금 <strong>{current.name}</strong>({accountLabel(current)})으로 로그인되어 있습니다.
            </span>
            <button type="button" onClick={logout} className="font-bold text-accent underline underline-offset-4">
              로그아웃
            </button>
          </p>
        )}

        <Panel id="login-form-title" title="계정으로 로그인">
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <label htmlFor="login-email" className="flex flex-col gap-1.5">
              <span className="font-bold">이메일</span>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
                className="min-h-[60px] rounded-[14px] border-2 border-control bg-surface px-[18px] text-ink"
              />
            </label>
            <label htmlFor="login-password" className="flex flex-col gap-1.5">
              <span className="font-bold">비밀번호</span>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
                className="min-h-[60px] rounded-[14px] border-2 border-control bg-surface px-[18px] text-ink"
              />
            </label>
            {error && (
              <p id="login-error" role="alert" className="m-0 font-bold text-warn-ink">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="min-h-[60px] rounded-[14px] bg-ink px-[22px] text-xl font-bold text-white disabled:opacity-60"
            >
              {busy ? "확인하는 중…" : "로그인"}
            </button>
          </form>
        </Panel>

        <Panel id="demo-accounts-title" title="체험용 계정">
          <p className="m-0 text-lg text-ink-3">개발·시연용 계정입니다 (DB 처음 데이터와 같습니다). 누르면 그 계정으로 바로 로그인합니다.</p>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => quickSignIn(a.email, a.password)}
                  aria-label={`${a.name}, ${accountLabel(a)} 계정으로 로그인`}
                  className="flex min-h-[64px] w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border-2 border-control bg-bg px-[18px] py-3 text-left text-ink hover:border-ink"
                >
                  <span className="text-xl font-bold">{a.name}</span>
                  <span className="text-[17px] text-ink-3">{accountLabel(a)}</span>
                  <span className="w-full text-[16px] text-ink-2">
                    {a.email} / 비밀번호 {a.password}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </main>
    </div>
  );
}
