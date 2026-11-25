"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EXERCISE_CATEGORIES, EXERCISE_CATEGORY_LABELS, type ExerciseCategory } from "@yconic/shared-types";
import { Button } from "@/user/components/ui";
import { VideoCard } from "@/user/components/video-cards";
import { usePage, usePageCommands, useShell } from "@/user/lib/shell";

/**
 * 운동 고르기 (/videos, 시안 D 네온 그린 · 03 운동 고르기, 흐름 A2).
 * 머리말의 '운동하기'나 "운동 목록"이라는 말로 온다. 전체 운동이 유튜브처럼 썸네일 카드로 나오고, 누르거나 이름을 말하면 시작한다.
 * 부위로 찾으려면 "하체 운동 찾아줘"처럼 말한다 (검색 결과 화면).
 */
export default function VideosPage() {
  const { exercises, exercisesError, reloadExercises, levelOf, openExercise, say, shouldAnnounce } = useShell();
  const [category, setCategory] = useState<ExerciseCategory | null>(null);
  usePage({ mode: "consume", title: "운동 고르기", chips: ["스쿼트 시작", "하체 운동 찾아줘", "처음으로"] });

  const shown = useMemo(() => (exercises ? exercises.filter((e) => !category || e.category === category) : null), [category, exercises]);

  // 처음 열면 어떤 운동이 있는지 읽어 준다 (에이전트가 이미 말했으면 건너뛴다)
  const announcedRef = useRef(false);
  useEffect(() => {
    if (!exercises || announcedRef.current) return;
    announcedRef.current = true;
    if (!shouldAnnounce()) return;
    void say(
      exercises.length
        ? `운동 고르기입니다. ${exercises.map((e) => e.title).join(", ")}가 있습니다. 이름을 말하거나 눌러서 시작하세요.`
        : "아직 공개된 운동이 없어요.",
    );
  }, [exercises, say, shouldAnnounce]);

  const pick = (c: ExerciseCategory | null) => {
    setCategory(c);
    const list = exercises?.filter((e) => !c || e.category === c) ?? [];
    void say(c ? `${EXERCISE_CATEGORY_LABELS[c]} 운동은 ${list.map((e) => e.title).join(", ") || "없어요"}.` : `전체 운동 ${list.length}개를 보여 드려요.`);
  };

  // "스트레칭만", "전부 보여줘"처럼 이 화면에서 분류를 고르는 말
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
          운동 목록을 불러오지 못했어요. {exercisesError}
        </p>
        <Button tone="soft" block={false} onClick={reloadExercises}>
          다시 시도
        </Button>
      </section>
    );
  }
  if (!shown) return <p className="m-0 text-ink-2">운동 목록을 불러오는 중이에요.</p>;

  return (
    <section aria-labelledby="videos-count" className="flex flex-col gap-4">
      <h2 id="videos-count" className="m-0 text-[22px] font-extrabold">
        {category ? `${EXERCISE_CATEGORY_LABELS[category]} 운동` : "전체 운동"} {shown.length}개
        {category && (
          <button type="button" onClick={() => pick(null)} className="ml-3 text-[17px] font-bold text-info underline decoration-2 underline-offset-[5px] hover:text-info-light">
            전체 보기
          </button>
        )}
      </h2>
      {shown.length === 0 ? (
        <p className="m-0 text-ink-2">이 분류에는 아직 공개된 운동이 없어요.</p>
      ) : (
        // 유튜브처럼 썸네일 격자. 카드 하나가 버튼 하나이고, 스크린리더는 제목·분류·길이·안내 수준을 한 번에 읽는다
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-4 gap-y-7 p-0">
          {shown.map((e) => (
            <li key={e.id}>
              <VideoCard exercise={e} level={levelOf(e)} onOpen={() => openExercise(e.id, false)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
