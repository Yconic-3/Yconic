"use client";

import { useState, type FormEvent } from "react";
import { ADMIN_ROLE_LABELS } from "@yconic/shared-types";
import { isShareAdminAllowed, isShareMode } from "@/lib/api-mode";
import { DEMO_ACCOUNTS, signIn, type SignedInAccount } from "@/lib/auth";
import { Button, Icon, ICONS, INPUT_CLASS, Section } from "./ui";

export function accountLabel(a: Pick<SignedInAccount, "adminRole">): string {
  return a.adminRole ? `관리자 · ${ADMIN_ROLE_LABELS[a.adminRole]}` : "일반 회원";
}

/**
 * 로그인 (시안 D 네온 그린 · 08 로그인 기능 접근 시): 저장된 계정으로 한 번에 로그인(간편 로그인)이 먼저 나오고,
 * 다른 체험 계정과 이메일·비밀번호 로그인은 그 아래에 둔다. 내 계정 화면(/account)과 로그인 화면(/login)이 함께 쓴다.
 * 로그인에 성공하면 onSignedIn을 부른다. 어디로 갈지는 부른 쪽이 정한다.
 */
export function LoginForm({ onSignedIn, idPrefix = "login" }: { onSignedIn: (account: SignedInAccount) => void; idPrefix?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    onSignedIn(result.account);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void attempt(email, password);
  }

  const errorId = `${idPrefix}-error`;
  // 공개 링크(관리자 허용 전)에서는 일반 회원만 보인다
  const accounts = isShareMode() && !isShareAdminAllowed() ? DEMO_ACCOUNTS.filter((a) => !a.adminRole) : DEMO_ACCOUNTS;
  // 저장된 계정 (시안 D: 간편 로그인). 일반 회원을 먼저 보여 준다
  const saved = accounts.find((a) => !a.adminRole) ?? accounts[0];
  const others = accounts.filter((a) => a !== saved);
  const quick = (a: (typeof accounts)[number]) => {
    setEmail(a.email);
    setPassword(a.password);
    void attempt(a.email, a.password);
  };

  return (
    <>
      {saved && (
        <section aria-label="저장된 계정" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5 rounded-2xl border-2 border-control bg-panel px-5 py-4">
            <span className="text-[22px] font-bold">{saved.name}</span>
            <span className="text-[17px] text-ink-3">{saved.email} · 간편 로그인 저장됨</span>
          </div>
          <Button tone="primary" size="xl" icon={ICONS.login} disabled={busy} aria-busy={busy} onClick={() => quick(saved)}>
            {busy ? "확인하는 중…" : `${saved.name}님으로 로그인`}
          </Button>
        </section>
      )}

      {error && (
        <p id={errorId} role="alert" className="m-0 rounded-2xl border-2 border-warn bg-warn-tint px-[18px] py-4 font-bold text-warn-ink">
          {error}
        </p>
      )}

      {others.length > 0 && (
        <Section id={`${idPrefix}-demo-title`} title="다른 체험 계정">
          <p className="m-0 text-[17px] text-ink-3">
            {isShareMode()
              ? "시연용 계정입니다. 관리자 계정으로 들어가면 설정(톱니)에서 관리자 화면으로 갈 수 있어요."
              : "개발·시연용 계정입니다 (DB 처음 데이터와 같습니다). 누르면 바로 로그인합니다."}
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {others.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => quick(a)}
                  aria-label={`${a.name}, ${accountLabel(a)} 계정으로 로그인`}
                  className="flex min-h-[64px] w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-2xl border-[3px] border-control bg-bg px-[18px] py-3 text-left text-ink hover:border-accent hover:bg-hover disabled:opacity-60"
                >
                  <span className="text-[20px] font-bold">{a.name}</span>
                  <span className="text-[17px] text-ink-3">
                    {accountLabel(a)} · {a.email}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <details className="group rounded-2xl border-2 border-control bg-panel px-5 py-3">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2 text-[19px] font-bold">
          <Icon d={ICONS.next} size={22} />
          다른 계정으로 로그인 (이메일·비밀번호)
        </summary>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 pb-3 pt-2">
          <label htmlFor={`${idPrefix}-email`} className="flex flex-col gap-2">
            <span className="text-[19px] font-bold">이메일</span>
            <input
              id={`${idPrefix}-email`}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className={INPUT_CLASS}
            />
          </label>
          <label htmlFor={`${idPrefix}-password`} className="flex flex-col gap-2">
            <span className="text-[19px] font-bold">비밀번호</span>
            <input
              id={`${idPrefix}-password`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className={INPUT_CLASS}
            />
          </label>
          <Button type="submit" tone="inverse" size="lg" icon={ICONS.login} disabled={busy} aria-busy={busy}>
            {busy ? "확인하는 중…" : "로그인"}
          </Button>
        </form>
      </details>
    </>
  );
}
