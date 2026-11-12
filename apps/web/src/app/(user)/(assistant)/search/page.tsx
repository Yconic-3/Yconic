"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { EXERCISE_CATEGORIES, EXERCISE_CATEGORY_LABELS } from "@yconic/shared-types";
import { Button } from "@/user/components/ui";
import { VideoRow } from "@/user/components/video-cards";
import { euroRo } from "@/user/lib/korean";
import { searchExercises, searchPath } from "@/user/lib/search";
import { usePage, useShell } from "@/user/lib/shell";
import { useRouter } from "next/navigation";

/**
 * 검색 결과 (/search?q=…). 말로 찾거나 검색창에 쓴 말로 찾은 운동 영상 목록.
 * 영상을 고르면 시청 화면(/exercises/[id])으로 간다.
 */
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchResults />
    </Suspense>
  );
}

function SearchResults() {
  const { exercises, levelOf, openExercise, say, shouldAnnounce } = useShell();
  const router = useRouter();
  const q = (useSearchParams().get("q") ?? "").trim();
  usePage({ mode: "consume", title: q ? `‘${q}’ 검색 결과` : "검색", chips: ["스쿼트 시작", "다른 운동 찾아줘", "처음으로"] });

  const results = useMemo(() => (exercises ? searchExercises(exercises, q) : null), [exercises, q]);

  // 검색어가 바뀌고 결과가 나오면 몇 개를 찾았는지 읽어 준다 (에이전트가 이미 말했으면 건너뛴다)
  const announcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!results || announcedRef.current === q) return;
    announcedRef.current = q;
    if (!shouldAnnounce()) return;
    void say(
      results.length
        ? `${euroRo(q)} 찾은 영상은 ${results.length}개입니다. ${results.map((e) => e.title).join(", ")}. 이름을 말하거나 영상을 고르면 시작합니다.`
        : `${q}에 맞는 영상을 찾지 못했어요. 다른 말로 찾거나 아래 분류에서 골라 주세요.`,
    );
  }, [q, results, say, shouldAnnounce]);

  if (!results) return <p className="m-0 text-ink-2">영상 목록을 불러오는 중이에요.</p>;

  if (results.length === 0) {
    return (
      <section aria-labelledby="no-result-title" className="flex flex-col gap-4">
        <h2 id="no-result-title" className="m-0 text-[24px] font-extrabold">
          찾은 영상이 없어요
        </h2>
        <p className="m-0 text-[18px] text-ink-2">다른 말로 찾거나, 분류에서 골라 보세요.</p>
        <div className="flex flex-wrap gap-3">
          {EXERCISE_CATEGORIES.map((c) => (
            <Button key={c} tone="line" block={false} className="px-6" onClick={() => router.push(searchPath(EXERCISE_CATEGORY_LABELS[c]))}>
              {EXERCISE_CATEGORY_LABELS[c]}
            </Button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="result-count" className="flex flex-col gap-4">
      <h2 id="result-count" className="m-0 text-[20px] font-bold text-ink-2">
        영상 {results.length}개
      </h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {results.map((e) => (
          <li key={e.id}>
            <VideoRow exercise={e} level={levelOf(e)} onOpen={() => openExercise(e.id, true)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
