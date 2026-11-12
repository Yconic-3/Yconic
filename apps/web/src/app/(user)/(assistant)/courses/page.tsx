"use client";

import { useState } from "react";
import { LEARNED_COURSES, type CourseId } from "@yconic/shared-types";
import { LoginRequired } from "@/user/components/creator-ui";
import { ICONS, ListButton, Section } from "@/user/components/ui";
import { usePage, usePageCommands, useShell } from "@/user/lib/shell";

/**
 * 내 강의 (/courses). 강사에게 배운 강의를 고른다.
 * 고른 강의의 동작은 배운 용어로 짧게, 나머지는 자세하게 안내한다 (docs/decisions/0007).
 */
export default function CoursesPage() {
  const { account, learnedCourses, setLearnedCourses, say } = useShell();
  const [error, setError] = useState<string | null>(null);
  usePage({ mode: "consume", title: "내 강의", chips: ["하체 강의 들었어", "코어 강의 안 들었어", "운동하기"] });

  async function toggle(id: CourseId, label: string) {
    const current = learnedCourses ?? [];
    const on = !current.includes(id);
    setError(null);
    try {
      await setLearnedCourses(on ? [...current, id] : current.filter((c) => c !== id));
      void say(on ? `${label} 강의를 수강한 것으로 기록했어요. 그 동작들은 짧게 안내할게요.` : `${label} 강의를 수강 목록에서 뺐어요.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    }
  }

  usePageCommands((text) => {
    if (/뭐|무엇|목록/.test(text) && text.includes("강의")) {
      const taken = LEARNED_COURSES.filter((c) => learnedCourses?.includes(c.id)).map((c) => c.label);
      void say(taken.length ? `지금 등록한 강의는 ${taken.join(", ")}입니다.` : "아직 등록한 강의가 없습니다. 하체, 코어, 상체, 스트레칭 중에서 말씀해 주세요.");
      return true;
    }
    return false;
  });

  if (!account) return <LoginRequired />;

  return (
    <Section id="courses-title" title="강사에게 배운 강의">
      <p className="m-0 text-[18px] text-ink-2">배운 동작은 짧게, 처음 하는 동작은 자세히 안내합니다. 누르면 켜고 끕니다.</p>
      {learnedCourses === null ? (
        <p className="m-0 text-ink-2">불러오는 중이에요.</p>
      ) : (
        LEARNED_COURSES.map((c) => {
          const on = learnedCourses.includes(c.id);
          return (
            <ListButton
              key={c.id}
              icon={on ? ICONS.check : ICONS.plus}
              title={c.label}
              sub={on ? "수강함 · 짧게 안내" : "수강 안 함 · 자세히 안내"}
              pressed={on}
              onClick={() => void toggle(c.id, c.label)}
            />
          );
        })
      )}
      {error && (
        <p role="alert" className="m-0 rounded-2xl border-2 border-warn bg-warn-tint px-[18px] py-4 font-bold text-warn-ink">
          {error}
        </p>
      )}
    </Section>
  );
}
