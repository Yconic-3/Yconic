import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * 한 줄에 하나씩 놓는 큰 버튼. 화면 폭 전체를 차지해 손끝으로 찾기 쉽고,
 * 스크린리더로 넘기는 순서와 화면 위치가 같다.
 */
type Variant = "primary" | "dark" | "outline" | "soft";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "border-accent bg-accent text-white",
  dark: "border-ink bg-ink text-white",
  outline: "border-ink bg-surface text-ink",
  soft: "border-control bg-surface text-ink",
};

export function RowButton({
  variant = "outline",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "lg" }) {
  const sizeClass = size === "lg" ? "min-h-[76px] text-2xl font-black" : "min-h-[64px] text-xl font-bold";
  return (
    <button
      type="button"
      {...rest}
      className={`flex w-full items-center gap-3 rounded-2xl border-[3px] px-4 py-2 text-left disabled:opacity-60 ${sizeClass} ${VARIANT_CLASS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/** 제목이 붙은 구역. 스크린리더에서 제목 단위로 건너뛸 수 있다. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <h2 id={id} className="text-xl font-black">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function MicIcon({ size = 40 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11l8-7 8 7M6 10v10h12V10" />
    </svg>
  );
}
