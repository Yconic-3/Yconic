import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * 사용자 화면(시안 D · 소리벗, 다크 고대비) 공통 부품.
 * 버튼 상태: 기본 → 마우스 올림 → 누르는 중 → 지금 화면/선택됨(aria-current, aria-pressed).
 * 노랑은 가장 중요한 조작과 '지금 여기'에만, 하늘색은 보조 조작에 쓴다. 상태는 색만으로 알리지 않는다.
 */

/** 선 아이콘 경로 (24×24) */
export const ICONS = {
  exercise: "M4 9v6M7 6v12M17 6v12M20 9v6M7 12h10",
  upload: "M12 16V5M7 10l5-5 5 5M5 19h14",
  login: "M10 5h8v14h-8M4 12h10M11 8l4 4-4 4",
  logout: "M14 5H6v14h8M10 12h10M17 8l4 4-4 4",
  user: "M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 20c1-4 4-6 8-6s7 2 8 6",
  play: "M7 5v14l11-7z",
  pause: "M8 5v14M16 5v14",
  speaker: "M4 10v4h4l5 4V6L8 10H4zM16 9a4 4 0 0 1 0 6",
  speakerWide: "M4 10v4h4l5 4V6L8 10H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  speakerOff: "M4 10v4h4l5 4V6L8 10H4zM17 9l5 6M22 9l-5 6",
  dot: "M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0",
  check: "M5 12l5 5 9-10",
  plus: "M12 5v14M5 12h14",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  book: "M5 4h13v16H5zM9 8h6M9 12h6",
  swap: "M4 8h14l-4-4M20 16H6l4 4",
  video: "M4 6h11v12H4zM15 10l5-3v10l-5-3",
  back: "M19 12H5M11 6l-6 6 6 6",
  home: "M4 11l8-7 8 7M6 10v10h12V10",
  next: "M9 6l6 6-6 6",
  prev: "M15 6l-6 6 6 6",
  repeat: "M4 12a8 8 0 1 0 3-6.2M4 4v5h5",
  send: "M4 12l16-8-6 16-3-7-7-1z",
  chat: "M4 5h16v11H9l-5 4z",
  search: "M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-4-4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
} as const;

export function Icon({ d, size = 24, strokeWidth = 2.4 }: { d: string; size?: number; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
    >
      <path d={d} />
    </svg>
  );
}

export function MicIcon({ size = 48 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    </svg>
  );
}

export function LogoIcon() {
  return (
    <svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="flex-none">
      <path d="M8 20h4l3-9 4 18 4-13 3 6h6" />
    </svg>
  );
}

/** 머리말의 로고와 이름. 누르면 운동하기 홈으로 간다 */
export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 !text-ink no-underline" aria-label="소리벗 운동하기 홈">
      <span className="text-accent">
        <LogoIcon />
      </span>
      <span className="whitespace-nowrap text-[28px] font-extrabold tracking-[-0.5px]" aria-hidden>
        소리벗
      </span>
      <span className="hidden text-base text-ink-3 xl:inline" aria-hidden>
        말로 찾고, 듣고 따라 하는 운동
      </span>
    </Link>
  );
}

export type ButtonTone = "primary" | "line" | "soft" | "info" | "inverse";

const TONE: Record<ButtonTone, string> = {
  primary: "border-0 bg-accent text-bg hover:bg-accent-hover active:bg-accent-active",
  line: "border-[3px] border-ink bg-panel text-ink hover:border-accent hover:bg-hover active:border-ink active:bg-ink active:text-bg",
  soft: "border-2 border-control bg-bg text-ink hover:border-ink hover:bg-hover active:bg-control active:text-bg",
  info: "border-[3px] border-info bg-bg text-info hover:bg-info-tint active:bg-info active:text-bg",
  inverse: "border-[3px] border-ink bg-ink text-bg hover:border-ink-2 hover:bg-ink-2 active:bg-ink-3",
};

const SIZE = {
  xl: "min-h-[84px] rounded-[18px] text-[26px] font-extrabold gap-3.5",
  lg: "min-h-[68px] rounded-2xl text-[22px] font-bold gap-3",
  md: "min-h-[60px] rounded-2xl text-[19px] font-bold gap-3",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  size?: keyof typeof SIZE;
  icon?: string;
  /** 한 줄 가득 */
  block?: boolean;
};

/** 가운데 정렬 버튼 */
export function Button({ tone = "line", size = "md", icon, block = true, className = "", children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      className={`flex items-center justify-center px-5 disabled:cursor-not-allowed disabled:opacity-60 ${block ? "w-full" : ""} ${TONE[tone]} ${SIZE[size]} ${className}`}
    >
      {icon && <Icon d={icon} size={size === "xl" ? 30 : 26} strokeWidth={size === "xl" ? 2.6 : 2.4} />}
      <span>{children}</span>
    </button>
  );
}

/**
 * 왼쪽 정렬 목록 버튼: 아이콘 + 굵은 이름 + 아래 설명.
 * current면 노란 테두리와 '(지금 화면)'처럼 글자로도 알린다 (mark로 넘긴다).
 */
export function ListButton({
  icon,
  title,
  sub,
  current,
  pressed,
  mark,
  onClick,
  currentKind = "page",
}: {
  icon: string;
  title: ReactNode;
  sub?: ReactNode;
  current?: boolean;
  /** 켜고 끄는 버튼이면 지금 켜졌는지 */
  pressed?: boolean;
  mark?: string;
  onClick: () => void;
  currentKind?: "page" | "step";
}) {
  const on = current || pressed;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? currentKind : undefined}
      aria-pressed={pressed}
      className={`flex min-h-[72px] w-full flex-col justify-center gap-0.5 rounded-2xl px-[18px] py-3 text-left text-ink ${
        on ? "border-[3px] border-accent bg-accent-tint hover:bg-accent-tint-2" : "border-[3px] border-ink bg-panel hover:border-accent hover:bg-hover"
      }`}
    >
      <span className="flex items-center gap-3 text-[22px] font-bold">
        <Icon d={icon} size={26} />
        <span>
          {title}
          {mark}
        </span>
      </span>
      {sub && <span className="pl-[38px] text-[18px] text-ink-2">{sub}</span>}
    </button>
  );
}

/** 제목이 있는 구역. 스크린리더가 제목 단위로 건너뛸 수 있다 */
export function Section({ id, title, children, className = "" }: { id: string; title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`flex flex-col gap-4 ${className}`}>
      <h2 id={id} className="m-0 text-[24px] font-extrabold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** 주의 상자 */
export function Caution({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="m-0 rounded-2xl border-2 border-warn bg-warn-tint px-[18px] py-4 text-[18px] text-warn-ink">
      <span className="font-bold">{label}.</span> {children}
    </p>
  );
}

/** 안내 상자 (하늘색 테두리) */
export function InfoBox({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 rounded-[20px] border-2 border-info bg-panel p-6">{children}</div>;
}

/** 입력칸 공통 모양 */
export const INPUT_CLASS =
  "min-h-[60px] w-full rounded-2xl border-[3px] border-ink bg-bg px-4 text-[19px] text-ink placeholder:text-ink-3";
