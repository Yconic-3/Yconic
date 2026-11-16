"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EXERCISE_CATEGORIES, EXERCISE_CATEGORY_LABELS, type ExerciseCategory } from "@yconic/shared-types";
import { Button } from "@/user/components/ui";
import { VideoCard } from "@/user/components/video-cards";
import { usePage, usePageCommands, useShell } from "@/user/lib/shell";

/**
 * 모든 운동 영상 (/videos). 메뉴의 '모든 운동 영상'이나 "모든 영상 보여줘"로 온다.
 * 시작 화면은 말하기와 검색창만 두고, 영상 목록과 분류는 여기서 본다.
 */
export default function VideosPage() {
  const { exercises, exercisesError, reloadExercises, levelOf, openExercise, say, shouldAnnounce } = useShell();
  const [category, setCategory] = useState<ExerciseCategory | null>(null);
  usePage({ mode: "consume", title: "모든 운동 영상", chips: ["스트레칭만", "스쿼트 시작", "처음으로"] });

  const shown = useMemo(() => (exercises ? exercises.filter((e) => !category || e.category === category) : null), [category, exercises]);

  // 처음 열면 몇 개가 있는지 읽어 준다 (에이전트가 이미 말했으면 건너뛴다)
  const announcedRef = useRef(false);
  useEffect(() => {
    if (!exercises || announcedRef.current) return;
    announcedRef.current = true;
    if (!shouldAnnounce()) return;
    void say(
      exercises.length
        ? `모든 운동 영상은 ${exercises.length}개입니다. ${exercises.map((e) => e.title).join(", ")}. 이름을 말하면 시작합니다.`
        : "아직 공개된 운동 영상이 없어요.",
    );
  }, [exercises, say, shouldAnnounce]);

  const pick = (c: ExerciseCategory | null) => {
    setCategory(c);
    const count = exercises?.filter((e) => !c || e.category === c).length ?? 0;
    void say(c ? `${EXERCISE_CATEGORY_LABELS[c]} 영상 ${count}개를 보여 드려요.` : `모든 영상 ${count}개를 보여 드려요.`);
  };

  // "스트레칭만", "근력만 보여줘", "전부"처럼 이 화면에서 분류를 고르는 말
  usePageCommands((text) => {
    if (/전부|전체|다 보여/.test(text)) {
      pick(null);
      return true;
    }
    const c = EXERCISE_CATEGORIES.find((x) => text.includes(EXERCISE_CATEGORY_LABELS[x]) && /만|보여|골라/.test(text));
    if (c) {
      pick(c);
      return true;
    }
    return false;
  });

  if (exercisesError) {
    return (
      <section className="flex flex-col gap-3">
        <p role="alert" className="m-0 text-ink-2">
          영상 목록을 불러오지 못했어요. {exercisesError}
        </p>
        <Button tone="soft" block={false} onClick={reloadExercises}>
          다시 시도
        </Button>
      </section>
    );
  }
  if (!shown) return <p className="m-0 text-ink-2">영상 목록을 불러오는 중이에요.</p>;

  return (
    <>
      <section aria-labelledby="category-title" className="flex flex-col gap-4">
        <h2 id="category-title" className="m-0 text-[24px] font-extrabold">
          분류로 보기
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button tone={category === null ? "primary" : "line"} block={false} aria-pressed={category === null} onClick={() => pick(null)} className="px-6">
            전체
          </Button>
          {EXERCISE_CATEGORIES.map((c) => (
            <Button key={c} tone={category === c ? "primary" : "line"} block={false} aria-pressed={category === c} onClick={() => pick(c)} className="px-6">
              {EXERCISE_CATEGORY_LABELS[c]}
            </Button>
          ))}
        </div>
      </section>

      <section aria-labelledby="videos-count" className="flex flex-col gap-4">
        <h2 id="videos-count" className="m-0 text-[20px] font-bold text-ink-2">
          {category ? `${EXERCISE_CATEGORY_LABELS[category]} 영상` : "영상"} {shown.length}개
        </h2>
        {shown.length === 0 ? (
          <p className="m-0 text-ink-2">이 분류에는 아직 공개된 영상이 없어요.</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-x-5 gap-y-8 p-0">
            {shown.map((e) => (
              <li key={e.id}>
                <VideoCard exercise={e} level={levelOf(e)} onOpen={() => openExercise(e.id, true)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
