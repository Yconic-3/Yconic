"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ADMIN_ROLE_LABELS, PASSWORD_MIN_LENGTH, type AuthConfig } from "@yconic/shared-types";
import { isShareAdminAllowed, isShareMode } from "@/lib/api-mode";
import { DEMO_ACCOUNTS, fetchAuthConfig, signIn, signInWithGoogle, signUp, type SignedInAccount, type SignInResult } from "@/lib/auth";
import { Button, ICONS, INPUT_CLASS, Section } from "./ui";

export function accountLabel(a: Pick<SignedInAccount, "adminRole">): string {
  return a.adminRole ? `관리자 · ${ADMIN_ROLE_LABELS[a.adminRole]}` : "일반 회원";
}

// ── 구글 로그인 버튼 (Google Identity Services) ──

interface GoogleIdApi {
  initialize(options: { client_id: string; callback: (response: { credential?: string }) => void }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";
let googleScript: Promise<void> | null = null;

/** 구글 로그인 스크립트를 한 번만 불러온다 */
function loadGoogleScript(): Promise<void> {
  googleScript ??= new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleScript = null;
      reject(new Error("구글 로그인을 불러오지 못했습니다."));
    };
    document.head.appendChild(script);
  });
  return googleScript;
}

/**
 * 구글이 그려 주는 로그인 버튼. 누르면 구글 창에서 계정을 고르고, 구글이 준 ID 토큰을 onCredential로 넘긴다.
 * 버튼은 구글의 것이라 모양을 바꿀 수 없다. 화면 읽기 프로그램에는 "Google 계정으로 계속하기" 버튼으로 읽힌다.
 */
function GoogleButton({ clientId, onCredential, onError }: { clientId: string; onCredential(credential: string): void; onError(message: string): void }) {
  const holder = useRef<HTMLDivElement>(null);
  // 버튼을 다시 그리지 않도록, 늘 최신 함수를 부른다
  const handlers = useRef({ onCredential, onError });
  handlers.current = { onCredential, onError };

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        const api = window.google?.accounts?.id;
        if (cancelled || !api || !holder.current) return;
        api.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) handlers.current.onCredential(response.credential);
            else handlers.current.onError("구글 로그인을 끝내지 못했습니다. 다시 시도해 주세요.");
          },
        });
        holder.current.replaceChildren();
        api.renderButton(holder.current, { type: "standard", theme: "filled_black", size: "large", shape: "pill", text: "continue_with", logo_alignment: "left", locale: "ko", width: Math.min(360, holder.current.clientWidth || 360) });
      })
      .catch((e: unknown) => !cancelled && handlers.current.onError(e instanceof Error ? e.message : "구글 로그인을 불러오지 못했습니다."));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return <div ref={holder} className="flex min-h-[44px] w-full justify-center" />;
}

/**
 * 로그인과 회원가입 (docs/decisions/0016). 내 계정 화면(/account)과 로그인 화면(/login)이 함께 쓴다.
 * - 구글 계정으로 로그인 (서버에 구글 로그인이 켜져 있을 때)
 * - 이메일·비밀번호로 로그인, 처음이면 회원가입
 * - 체험 계정으로 한 번에 로그인: 내 컴퓨터에서 켰을 때만 보인다 (공개 서버에서는 서버가 숨긴다)
 * 로그인에 성공하면 onSignedIn을 부른다. 어디로 갈지는 부른 쪽이 정한다.
 */
export function LoginForm({ onSignedIn, idPrefix = "login" }: { onSignedIn: (account: SignedInAccount) => void; idPrefix?: string }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 로그인 유지 (docs/decisions/0017). 켜 두면 이 기기에서 다시 들어와도 로그인이 풀리지 않는다
  const [remember, setRemember] = useState(true);
  const [config, setConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthConfig().then((c) => !cancelled && setConfig(c));
    return () => {
      cancelled = true;
    };
  }, []);

  async function attempt(work: () => Promise<SignInResult>) {
    if (busy) return;
    setBusy(true);
    const result = await work();
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
    void attempt(() => (mode === "signup" ? signUp(name, email, password, remember) : signIn(email, password, remember)));
  }

  function switchMode(next: "login" | "signup") {
    setMode(next);
    setError(null);
  }

  const errorId = `${idPrefix}-error`;
  const signingUp = mode === "signup";

  // 체험 계정: 서버가 보여 주라고 할 때만. 공개 링크(관리자 허용 전)에서는 일반 회원만 보인다
  const demo = config?.demoAccounts ? (isShareMode() && !isShareAdminAllowed() ? DEMO_ACCOUNTS.filter((a) => !a.adminRole) : DEMO_ACCOUNTS) : [];
  const quick = (a: (typeof demo)[number]) => {
    switchMode("login");
    setEmail(a.email);
    setPassword(a.password);
    void attempt(() => signIn(a.email, a.password, remember));
  };

  // 로그인 유지 고르기. 구글 로그인과 이메일 로그인 모두에 적용되므로 맨 위에 둔다
  const rememberBox = (
    <label htmlFor={`${idPrefix}-remember`} className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border-2 border-control bg-panel px-[18px] py-3">
      <input id={`${idPrefix}-remember`} type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} aria-describedby={`${idPrefix}-remember-hint`} className="h-7 w-7 shrink-0 accent-accent" />
      <span className="flex flex-col">
        <span className="text-[19px] font-bold">로그인 유지</span>
        <span id={`${idPrefix}-remember-hint`} className="text-[16px] text-ink-3">
          {remember ? "이 기기에서 다시 들어와도 로그인되어 있습니다." : "브라우저를 닫으면 로그아웃됩니다. 함께 쓰는 기기에서는 끄세요."}
        </span>
      </span>
    </label>
  );

  return (
    <>
      {rememberBox}
      {config?.googleClientId && (
        <section aria-label="구글 계정으로 로그인" className="flex flex-col gap-3">
          <GoogleButton clientId={config.googleClientId} onCredential={(credential) => void attempt(() => signInWithGoogle(credential, remember))} onError={setError} />
          <p className="m-0 text-center text-[17px] text-ink-3">구글 계정이 있으면 가입하지 않고 바로 쓸 수 있습니다.</p>
        </section>
      )}

      {error && (
        <p id={errorId} role="alert" className="m-0 rounded-2xl border-2 border-warn bg-warn-tint px-[18px] py-4 font-bold text-warn-ink">
          {error}
        </p>
      )}

      <Section id={`${idPrefix}-form-title`} title={signingUp ? "이메일로 회원가입" : "이메일로 로그인"}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {signingUp && (
            <label htmlFor={`${idPrefix}-name`} className="flex flex-col gap-2">
              <span className="text-[19px] font-bold">이름</span>
              <input
                id={`${idPrefix}-name`}
                type="text"
                autoComplete="name"
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
                className={INPUT_CLASS}
              />
            </label>
          )}
          <label htmlFor={`${idPrefix}-email`} className="flex flex-col gap-2">
            <span className="text-[19px] font-bold">이메일</span>
            <input
              id={`${idPrefix}-email`}
              type="email"
              autoComplete={signingUp ? "email" : "username"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className={INPUT_CLASS}
            />
          </label>
          <label htmlFor={`${idPrefix}-password`} className="flex flex-col gap-2">
            <span className="text-[19px] font-bold">비밀번호{signingUp ? ` (${PASSWORD_MIN_LENGTH}자 이상)` : ""}</span>
            <input
              id={`${idPrefix}-password`}
              type="password"
              autoComplete={signingUp ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className={INPUT_CLASS}
            />
          </label>
          <Button type="submit" tone="primary" size="xl" icon={signingUp ? ICONS.user : ICONS.login} disabled={busy} aria-busy={busy}>
            {busy ? "확인하는 중…" : signingUp ? "가입하고 시작하기" : "로그인"}
          </Button>
        </form>
        {(config?.signup ?? true) && (
          <Button size="lg" disabled={busy} onClick={() => switchMode(signingUp ? "login" : "signup")}>
            {signingUp ? "이미 계정이 있어요. 로그인하기" : "처음이에요. 회원가입하기"}
          </Button>
        )}
      </Section>

      {demo.length > 0 && (
        <Section id={`${idPrefix}-demo-title`} title="체험 계정">
          <p className="m-0 text-[17px] text-ink-3">
            {isShareMode()
              ? "시연용 계정입니다. 관리자 계정으로 들어가면 설정(톱니)에서 관리자 화면으로 갈 수 있어요."
              : "개발·시연용 계정입니다 (DB 처음 데이터와 같습니다). 누르면 바로 로그인합니다."}
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {demo.map((a) => (
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
    </>
  );
}
