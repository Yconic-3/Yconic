import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * 사용자 화면(시안 B · 말벗핏) 공통 부품.
 * 누를 수 있는 요소의 테두리는 바탕 대비 3:1 이상(control 토큰)을 지킨다.
 * 장식용 선(line 토큰)은 카드 테두리처럼 누르지 않는 곳에만 쓴다.
 */

/** "바로 말하기" 둥근 예시 버튼 */
export function Chip({ className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`min-h-[52px] rounded-full border-2 border-control bg-surface px-5 font-bold text-ink hover:border-ink ${className}`}
    >
      {children}
    </button>
  );
}

/** 흰 바탕 카드 구역. 제목 단위로 스크린리더가 건너뛸 수 있다. */
export function Panel({ id, title, actions, children }: { id: string; title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3.5 rounded-[22px] border-2 border-line bg-surface p-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id={id} className="m-0 flex-1 font-serif-kr text-[26px] font-bold">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** 난이도처럼 짧은 꼬리표 */
export function Badge({ tone, children }: { tone: "warm" | "cool" | "sand"; children: ReactNode }) {
  const cls = {
    warm: "bg-accent-tint text-warn-ink",
    cool: "bg-[#dbeafe] text-[#1e3a8a]",
    sand: "bg-sand text-ink",
  }[tone];
  return <span className={`rounded-full px-3 py-1 text-[15px] font-bold ${cls}`}>{children}</span>;
}

/** 머리말의 로고와 이름. 누르면 처음 화면으로 간다. */
export function Brand({ showTagline = true }: { showTagline?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3 text-ink no-underline" aria-label="말벗핏 처음 화면">
      <span className="text-accent">
        <LogoIcon />
      </span>
      <span className="whitespace-nowrap font-display text-[28px] font-black" aria-hidden>
        말벗핏
      </span>
      {showTagline && (
        <span className="hidden text-base text-ink-3 sm:inline" aria-hidden>
          말로 묻고, 말로 안내받는 운동 비서
        </span>
      )}
    </Link>
  );
}

export function LogoIcon() {
  return (
    <svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <circle cx="20" cy="20" r="15" />
      <path d="M13 20c2-5 5-5 7 0s5 5 7 0" />
    </svg>
  );
}

export function MicIcon({ size = 56 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    </svg>
  );
}
