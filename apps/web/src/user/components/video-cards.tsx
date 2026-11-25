"use client";

import { DIFFICULTY_LABELS, EXERCISE_CATEGORY_LABELS, guideLevelLabel, type ExerciseCategory, type GuideLevel } from "@yconic/shared-types";
import type { PublishedExercise } from "@/user/lib/api";
import { formatDuration } from "@/user/lib/player";
import { Icon, ICONS } from "./ui";

/**
 * 유튜브처럼 영상을 고르는 부품: 썸네일, 카드(격자), 줄(목록).
 * 카드 전체가 한 버튼이고, 스크린리더는 "제목, 분류, 길이, 난이도, 안내 수준"을 한 번에 읽는다.
 * 썸네일은 꾸밈이라 스크린리더가 읽지 않는다.
 */

/** 영상이 없을 때 썸네일 바탕 (분류마다 다른 색. 글자 대비와 상관없는 꾸밈) */
const CATEGORY_TINT: Record<ExerciseCategory, string> = {
  STRETCHING: "from-[#1f3b4d] to-[#12303a]",
  STRENGTH: "from-[#4a3b12] to-[#2a2614]",
  CARDIO: "from-[#4d2a1f] to-[#2a1e1e]",
  BALANCE: "from-[#2f2a4d] to-[#1d1a33]",
  REHAB: "from-[#1f4d36] to-[#12301f]",
};

/** 영상의 1초 지점 장면. 파일이 없는 예시 영상은 분류 색과 아이콘 */
export function Thumbnail({ exercise, className = "", small = false }: { exercise: PublishedExercise; className?: string; small?: boolean }) {
  const url = exercise.video.url;
  return (
    <div aria-hidden="true" className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-black ${className}`}>
      {url ? (
        <video src={`${url}#t=1`} preload="metadata" muted playsInline tabIndex={-1} className="h-full w-full object-cover" />
      ) : (
        <div className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br text-ink ${CATEGORY_TINT[exercise.category]}`}>
          <Icon d={ICONS.exercise} size={small ? 32 : 48} strokeWidth={2} />
          {!small && <span className="text-[17px] font-bold">{EXERCISE_CATEGORY_LABELS[exercise.category]}</span>}
        </div>
      )}
      <span className="absolute bottom-2 right-2 rounded-md bg-black/85 px-2 py-0.5 text-[15px] font-bold text-white">
        {formatDuration(exercise.video.durationSec)}
      </span>
    </div>
  );
}

function meta(e: PublishedExercise, level: GuideLevel): string {
  return `${EXERCISE_CATEGORY_LABELS[e.category]} · ${formatDuration(e.video.durationSec)} · ${DIFFICULTY_LABELS[e.difficulty]} · ${guideLevelLabel(level)} 안내`;
}

/** 격자 카드: 썸네일 위, 제목·정보 아래 (시작 화면) */
export function VideoCard({ exercise, level, onOpen }: { exercise: PublishedExercise; level: GuideLevel; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col gap-3 rounded-[20px] border-[3px] border-transparent p-2 text-left text-ink hover:border-accent hover:bg-hover focus-visible:border-accent"
    >
      <Thumbnail exercise={exercise} />
      <span className="flex flex-col gap-1 px-1">
        <span className="text-[22px] font-bold leading-snug">{exercise.title}</span>
        <span className="text-[17px] text-ink-2">{meta(exercise, level)}</span>
      </span>
    </button>
  );
}

/** 줄: 썸네일 왼쪽, 제목·정보·요약 오른쪽 (검색 결과, 다음 영상). 좁은 화면에서는 위아래로 */
export function VideoRow({
  exercise,
  level,
  onOpen,
  compact = false,
}: {
  exercise: PublishedExercise;
  level: GuideLevel;
  onOpen: () => void;
  /** 다음 영상처럼 좁은 자리에서 쓸 때 */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full gap-4 rounded-[20px] border-[3px] border-transparent p-2 text-left text-ink hover:border-accent hover:bg-hover focus-visible:border-accent ${
        compact ? "flex-row" : "flex-row max-[700px]:flex-col"
      }`}
    >
      <Thumbnail exercise={exercise} small={compact} className={compact ? "!w-[168px] flex-none" : "!w-[360px] flex-none max-[700px]:!w-full"} />
      <span className="flex min-w-0 flex-col gap-1.5 py-1">
        <span className={`${compact ? "text-[19px]" : "text-[24px]"} font-bold leading-snug`}>{exercise.title}</span>
        <span className={`${compact ? "text-[15px]" : "text-[17px]"} text-ink-2`}>{meta(exercise, level)}</span>
        {!compact && exercise.summary && <span className="text-[17px] text-ink-3">{exercise.summary}</span>}
      </span>
    </button>
  );
}
