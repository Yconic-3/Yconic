"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { VideoCard } from "@/user/components/video-cards";
import { searchExercises } from "@/user/lib/search";
import { usePage, useShell } from "@/user/lib/shell";

/**
 * 부위별·찾은 운동 목록 (/search?q=…, 시안 D 네온 그린 · 04 부위별 운동 목록).
 * "하체 운동 찾아줘"처럼 말하거나 글로 쓴 말로 찾은 운동이 썸네일 카드로 나온다. 누르거나 이름을 말하면 시작한다.
 */
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchResults />
    </Suspense>
  );
}

/** 찾은 말을 화면 제목으로 ("하체" → "하체 운동", "스쿼트 시작" → "스쿼트 시작") */
function headline(q: string): string {
  if (!q) return "운동 찾기";
  return q.includes("운동") || q.split(/\s+/).length > 1 ? q : `${q} 운동`;
}

function SearchResults() {
  const { exercises, levelOf, openExercise, say, shouldAnnounce } = useShell();
  const q = (useSearchParams().get("q") ?? "").trim();
  const title = headline(q);
  usePage({ mode: "consume", title, chips: ["스쿼트 시작", "다른 운동 찾아줘", "처음으로"] });

  const results = useMemo(() => (exercises ? searchExercises(exercises, q) : null), [exercises, q]);

  // 검색어가 바뀌고 결과가 나오면 무엇을 찾았는지 읽어 준다 (에이전트가 이미 말했으면 건너뛴다)
  const announcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!results || announcedRef.current === q) return;
    announcedRef.current = q;
    if (!shouldAnnounce()) return;
    void say(
      results.length
        ? `${title}은 ${results.map((e) => e.title).join(", ")}이에요. 이름을 말하면 시작할게요.`
        : `${q}에 맞는 운동을 찾지 못했어요. 다른 말로 찾거나 화면 위 운동하기에서 골라 주세요.`,
    );
  }, [q, results, say, shouldAnnounce, title]);

  if (!results) return <p className="m-0 text-ink-2">운동 목록을 불러오는 중이에요.</p>;

  return (
    <section aria-labelledby="result-count" className="flex flex-col gap-4">
      <h2 id="result-count" className="m-0 text-[22px] font-extrabold">
        {title} {results.length}개
      </h2>
      {results.length === 0 ? (
        <p className="m-0 text-[18px] text-ink-2">찾은 운동이 없어요. 다른 말로 찾거나, 화면 위 운동하기에서 전체 목록을 보세요.</p>
      ) : (
        // 유튜브처럼 썸네일 격자. 카드 하나가 버튼 하나이고, 스크린리더는 제목·분류·길이·안내 수준을 한 번에 읽는다
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-4 gap-y-7 p-0">
          {results.map((e) => (
            <li key={e.id}>
              <VideoCard exercise={e} level={levelOf(e)} onOpen={() => openExercise(e.id, false)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
