"use client";

import { useEffect, useRef } from "react";
import { GUIDE_AGAIN, GUIDE_STEPS } from "@/user/lib/guide";
import { Icon, ICONS } from "./ui";

/**
 * 사용법 안내 창 (docs/decisions/0013).
 * 처음 온 사람에게 한 번만 저절로 뜨고, 그 뒤로는 물음표 버튼·"사용법 알려줘"·설정에서만 연다.
 * 브라우저는 사람이 화면을 누르기 전에는 소리를 내지 못하게 막는다. 그래서 화면 아무 곳이나 누르면 읽기 시작한다
 * (화면을 보지 않는 사람도 한 번 누르면 들을 수 있게). 다 읽으면 저절로 닫힌다.
 */
export interface GuideDialogProps {
  open: boolean;
  /** 처음 와서 저절로 뜬 것인지 */
  first: boolean;
  /** 음성 안내가 켜져 있는지 (꺼져 있으면 읽지 않고 글로만 보여 준다) */
  speechEnabled: boolean;
  /** 지금 이 안내를 읽고 있는지 */
  speaking: boolean;
  onListen(): void;
  onClose(): void;
}

export function GuideDialog(p: GuideDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // 열리면 첫 버튼으로 초점을 옮기고, Esc로 닫고, Tab은 창 안에서만 돈다
  useEffect(() => {
    if (!p.open) return;
    const root = dialogRef.current;
    // 작은 화면에서 창 위쪽이 잘리지 않게, 초점을 옮길 때 스크롤하지 않는다
    root?.querySelector<HTMLButtonElement>("button[data-primary]")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        p.onClose();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>("button")];
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
  const canListen = p.speechEnabled && !p.speaking;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-4"
      // 버튼이 아닌 곳을 누르면 읽기 시작한다 (닫지는 않는다)
      onClick={(e) => {
        if (canListen && !(e.target as HTMLElement).closest("button")) p.onListen();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-dialog-title"
        className="flex max-h-full w-full max-w-[640px] flex-col rounded-[24px] border-2 border-control bg-panel shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        {/* 작은 화면에서는 설명만 스크롤하고, 아래 버튼은 늘 보이게 둔다 */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-4 pt-6">
          <div className="flex flex-col gap-1.5">
            <p className="m-0 text-[16px] font-bold text-accent">{p.first ? "처음 한 번만 알려 드려요" : "도움말"}</p>
            <h2 id="guide-dialog-title" className="m-0 text-[28px] font-extrabold">
              소리벗 사용법
            </h2>
          </div>

          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            {GUIDE_STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-grad text-[20px] font-extrabold text-bg">
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="m-0 text-[20px] font-extrabold">{step.title}</h3>
                  <p className="m-0 text-[18px] leading-[1.55] text-ink-2">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="m-0 text-[16px] text-ink-3">{GUIDE_AGAIN}</p>
        </div>

        <div className="flex flex-col gap-3 border-t-2 border-line px-6 pb-6 pt-4">
          {p.speechEnabled && (
            <button
              type="button"
              data-primary
              onClick={() => canListen && p.onListen()}
              aria-pressed={p.speaking}
              className={`flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl px-5 text-[22px] font-extrabold text-bg ${
                p.speaking ? "bg-accent-hover shadow-[0_0_0_6px_rgba(220,243,95,0.35)]" : "bg-accent-grad"
              }`}
            >
              <Icon d={ICONS.speaker} size={26} />
              <span>{p.speaking ? "읽는 중…" : "소리로 듣기"}</span>
            </button>
          )}
          <button
            type="button"
            {...(p.speechEnabled ? {} : { "data-primary": true })}
            onClick={p.onClose}
            className="flex min-h-[60px] w-full items-center justify-center rounded-2xl border-[3px] border-control bg-bg px-5 text-[20px] font-bold text-ink hover:border-accent hover:bg-hover"
          >
            {p.speaking ? "건너뛰기" : p.first ? "바로 시작하기" : "닫기"}
          </button>
          {canListen && <p className="m-0 text-center text-[16px] text-ink-3">화면 아무 곳이나 눌러도 소리로 읽어 드려요. 다 읽으면 저절로 닫힙니다.</p>}
        </div>
      </div>
    </div>
  );
}
