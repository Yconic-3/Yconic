"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon, ICONS } from "./ui";

/**
 * 설정 창 (시안 D 네온 그린 · 02 설정 로그인 전 / 10 설정 로그인 후).
 * 머리말의 톱니 버튼이나 "설정"이라는 말로 연다. 화면 위에 겹쳐 뜨고, Esc·닫기 버튼으로 닫는다.
 * - 음성: 음성 안내 켜기·끄기, 읽기 속도, 부르면 듣기("소리벗")
 * - 화면: 글자 크기
 * - 도움말: 처음에 나온 사용법 다시 보기 (docs/decisions/0013)
 * - 계정: 로그인 전에는 로그인, 로그인 후에는 내 강의 설정·내 계정·로그아웃
 */

export const RATE_CHOICES = [
  { label: "느리게", value: 0.85 },
  { label: "보통", value: 1 },
  { label: "빠르게", value: 1.25 },
] as const;

export const FONT_CHOICES = [
  { label: "보통", value: 1 },
  { label: "크게", value: 1.15 },
  { label: "아주 크게", value: 1.3 },
] as const;

/** 지금 속도에 가장 가까운 선택지 */
export function nearestChoice<T extends { value: number }>(choices: readonly T[], value: number): T {
  return choices.reduce((best, c) => (Math.abs(c.value - value) < Math.abs(best.value - value) ? c : best), choices[0]!);
}

export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
  speechEnabled: boolean;
  onSpeech(on: boolean): void;
  rate: number;
  onRate(value: number): void;
  wakeEnabled: boolean;
  wakeWord: string;
  /** 단계가 끝날 때마다 다음 단계로 갈지 묻기 */
  askSteps: boolean;
  onAskSteps(on: boolean): void;
  onWake(on: boolean): void;
  fontScale: number;
  onFont(value: number): void;
  /** 로그인한 사람 이름. 로그인 전이면 null */
  accountName: string | null;
  /** 지금 등록한 강의 (예: "코어"). 없으면 "없음" */
  coursesLabel: string;
  isAdmin: boolean;
  onLogin(): void;
  onCourses(): void;
  onAccount(): void;
  onAdmin(): void;
  onLogout(): void;
  /** 사용법 안내를 다시 연다 */
  onGuide(): void;
}

export function SettingsDialog(p: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // 열리면 첫 선택지로 초점을 옮기고, Esc로 닫고, Tab은 창 안에서만 돈다
  useEffect(() => {
    if (!p.open) return;
    const root = dialogRef.current;
    (root?.querySelector<HTMLButtonElement>("button[aria-pressed='true']") ?? root?.querySelector<HTMLButtonElement>("button"))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        p.onClose();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>("button, [href], input")].filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open]);

  if (!p.open) return null;
  const rate = nearestChoice(RATE_CHOICES, p.rate).value;
  const font = nearestChoice(FONT_CHOICES, p.fontScale).value;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-6" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="flex w-full max-w-[640px] flex-col rounded-[24px] border-2 border-control bg-panel shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between gap-4 border-b-2 border-line px-6 py-5">
          <h2 id="settings-title" className="m-0 text-[28px] font-extrabold">
            설정
          </h2>
          <button
            type="button"
            onClick={p.onClose}
            aria-label="설정 닫기"
            className="flex h-[56px] w-[56px] items-center justify-center rounded-[14px] border-[3px] border-ink bg-bg text-ink hover:border-accent hover:bg-hover"
          >
            <Icon d={ICONS.close} size={28} />
          </button>
        </div>

        <div className="flex flex-col gap-6 px-6 py-6">
          <Group title="음성">
            <Choice label="음성 안내">
              <Option on={p.speechEnabled} onClick={() => p.onSpeech(true)}>
                켜기
              </Option>
              <Option on={!p.speechEnabled} onClick={() => p.onSpeech(false)}>
                끄기
              </Option>
            </Choice>
            <Choice label="읽기 속도">
              {RATE_CHOICES.map((c) => (
                <Option key={c.value} on={rate === c.value} onClick={() => p.onRate(c.value)}>
                  {c.label}
                </Option>
              ))}
            </Choice>
            <Choice label={`부르면 듣기 (“${p.wakeWord}”라고 부르면 듣기)`}>
              <Option on={p.wakeEnabled} onClick={() => p.onWake(true)}>
                켜기
              </Option>
              <Option on={!p.wakeEnabled} onClick={() => p.onWake(false)}>
                끄기
              </Option>
            </Choice>
            <Choice label="운동 중 단계가 끝나면 넘어갈지 묻기">
              <Option on={p.askSteps} onClick={() => p.onAskSteps(true)}>
                묻기
              </Option>
              <Option on={!p.askSteps} onClick={() => p.onAskSteps(false)}>
                바로 넘어가기
              </Option>
            </Choice>
          </Group>

          <hr className="m-0 border-0 border-t-2 border-line" />

          <Group title="화면">
            <Choice label="글자 크기">
              {FONT_CHOICES.map((c) => (
                <Option key={c.value} on={font === c.value} onClick={() => p.onFont(c.value)}>
                  {c.label}
                </Option>
              ))}
            </Choice>
          </Group>

          <hr className="m-0 border-0 border-t-2 border-line" />

          <Group title="도움말">
            <Row icon={ICONS.help} title="사용법 다시 보기" sub="처음에 나온 안내를 다시 보고 듣습니다" onClick={p.onGuide} />
          </Group>

          <hr className="m-0 border-0 border-t-2 border-line" />

          <Group title="계정">
            {p.accountName ? (
              <>
                <Row icon={ICONS.book} title="내 강의 설정" sub={`지금: ${p.coursesLabel}`} onClick={p.onCourses} />
                <Row icon={ICONS.user} title="내 계정" sub={`${p.accountName}님`} onClick={p.onAccount} />
                {p.isAdmin && <Row icon={ICONS.shield} title="관리자 화면" sub="콘텐츠 검수·공개" onClick={p.onAdmin} />}
                <Row icon={ICONS.logout} title="로그아웃" sub={`${p.accountName}님으로 로그인되어 있습니다`} onClick={p.onLogout} />
              </>
            ) : (
              <Row icon={ICONS.login} title="로그인" sub="저장된 계정 · 간편 로그인" onClick={p.onLogin} />
            )}
          </Group>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <h3 className="m-0 text-[18px] font-extrabold text-accent">{title}</h3>
      {children}
    </section>
  );
}

function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2.5">
      <span className="text-[18px] font-bold text-ink">{label}</span>
      <div className="grid auto-cols-fr grid-flow-col gap-2.5 max-[420px]:grid-flow-row">{children}</div>
    </div>
  );
}

function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border-[3px] px-3 text-[19px] font-bold ${
        on ? "border-accent bg-accent-grad text-bg" : "border-control bg-bg text-ink hover:border-accent hover:bg-hover"
      }`}
    >
      {on && <Icon d={ICONS.check} size={20} />}
      <span>{children}</span>
    </button>
  );
}

function Row({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[60px] w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-[3px] border-control bg-bg px-4 py-3 text-left text-ink hover:border-accent hover:bg-hover"
    >
      <Icon d={icon} />
      <span className="text-[19px] font-bold">{title}</span>
      <span className="text-[16px] text-ink-3">{sub}</span>
    </button>
  );
}
