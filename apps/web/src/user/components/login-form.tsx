"use client";

import { useState, type FormEvent } from "react";
import { ADMIN_ROLE_LABELS } from "@yconic/shared-types";
import { DEMO_ACCOUNTS, signIn, type SignedInAccount } from "@/lib/auth";
import { Button, ICONS, INPUT_CLASS, Section } from "./ui";

export function accountLabel(a: Pick<SignedInAccount, "adminRole">): string {
  return a.adminRole ? `관리자 · ${ADMIN_ROLE_LABELS[a.adminRole]}` : "일반 회원";
}

/**
 * 이메일·비밀번호 로그인과 체험용 계정 목록. 내 계정 화면(/account)과 로그인 화면(/login)이 함께 쓴다.
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
  return (
    <>
      <Section id={`${idPrefix}-form-title`} title="계정으로 로그인">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <label htmlFor={`${idPrefix}-email`} className="flex flex-col gap-2">
            <span className="text-[21px] font-bold">이메일</span>
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
            <span className="text-[21px] font-bold">비밀번호</span>
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
          {error && (
            <p id={errorId} role="alert" className="m-0 rounded-2xl border-2 border-warn bg-warn-tint px-[18px] py-4 font-bold text-warn-ink">
              {error}
            </p>
          )}
          <Button type="submit" tone="primary" size="xl" icon={ICONS.login} disabled={busy} aria-busy={busy}>
            {busy ? "확인하는 중…" : "로그인"}
          </Button>
        </form>
      </Section>

      <Section id={`${idPrefix}-demo-title`} title="체험용 계정">
        <p className="m-0 text-[18px] text-ink-2">개발·시연용 계정입니다 (DB 처음 데이터와 같습니다). 누르면 그 계정으로 바로 로그인합니다.</p>
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEmail(a.email);
                  setPassword(a.password);
                  void attempt(a.email, a.password);
                }}
                aria-label={`${a.name}, ${accountLabel(a)} 계정으로 로그인`}
                className="flex min-h-[72px] w-full flex-col justify-center gap-0.5 rounded-2xl border-2 border-control bg-bg px-[18px] py-3 text-left text-ink hover:border-ink hover:bg-hover disabled:opacity-60"
              >
                <span className="text-[22px] font-bold">
                  {a.name} <span className="text-[18px] font-normal text-ink-2">· {accountLabel(a)}</span>
                </span>
                <span className="text-[17px] text-ink-3">
                  {a.email} / 비밀번호 {a.password}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
