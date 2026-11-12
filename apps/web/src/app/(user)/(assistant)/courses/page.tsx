"use client";

import { useState } from "react";
import { findMovementInText, knowsMovement, LEARNED_COURSES, MOVEMENTS, PRACTICE_THRESHOLD, type CourseId, type MovementId, type MovementKnowledge } from "@yconic/shared-types";
import { LoginRequired } from "@/user/components/creator-ui";
import { Button, ICONS, INPUT_CLASS, ListButton, Section } from "@/user/components/ui";
import { eulReul } from "@/user/lib/korean";
import { usePage, usePageCommands, useShell } from "@/user/lib/shell";

/**
 * 내 강의·동작 (/courses).
 * 강사에게 배운 강의를 고르거나, 배운 동작을 하나씩 알린다. 여러 번 따라 한 동작도 배운 동작이 된다.
 * 배운 동작은 어느 영상에서든 짧게(배운 용어로), 처음 하는 동작은 자세하게 안내한다 (docs/decisions/0007, 0008).
 */
export default function CoursesPage() {
  const { account, learnedCourses, setLearnedCourses, learning, setMovementKnown, say } = useShell();
  const [error, setError] = useState<string | null>(null);
  usePage({ mode: "consume", title: "내 강의·동작", chips: ["스쿼트 배웠어", "하체 강의 들었어", "배운 동작 뭐야", "운동하기"] });

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

  async function toggleMovement(id: MovementId, label: string, known: boolean) {
    setError(null);
    try {
      await setMovementKnown(id, known);
      void say(known ? `${eulReul(label)} 배운 동작으로 기록했어요. 어느 영상에서든 짧게 안내할게요.` : `${eulReul(label)} 배운 동작에서 뺐어요.`);
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
    if (/뭐|무엇|목록/.test(text) && text.includes("동작") && !findMovementInText(text)) {
      const known = MOVEMENTS.filter((m) => knowsMovement(learning, m.id)).map((m) => m.label);
      void say(known.length ? `배운 동작은 ${known.join(", ")}입니다.` : '아직 배운 동작이 없어요. "스쿼트 배웠어"처럼 말해 주세요.');
      return true;
    }
    return false;
  });

  if (!account) return <LoginRequired />;

  return (
    <>
      <Section id="movements-title" title="내 동작">
        <p className="m-0 text-[18px] text-ink-2">
          배운 동작은 어느 영상에서든 짧게, 처음 하는 동작은 자세히 안내합니다. 영상을 끝까지 {PRACTICE_THRESHOLD}번 따라 하면 배운 동작이 됩니다. 누르면 켜고 끕니다.
        </p>
        {learning === null ? (
          <p className="m-0 text-ink-2">불러오는 중이에요.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {MOVEMENTS.map((m) => {
              const k = learning.movements.find((x) => x.movementId === m.id);
              const known = knowsMovement(learning, m.id);
              return (
                <li key={m.id} className="flex flex-col gap-2">
                  <ListButton
                    icon={known ? ICONS.check : ICONS.plus}
                    title={m.label}
                    sub={movementStatus(k, known)}
                    pressed={known}
                    onClick={() => void toggleMovement(m.id, m.label, !known)}
                  />
                  {known && <TermsEditor movementId={m.id} label={m.label} initial={k?.terms ?? ""} />}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section id="courses-title" title="강사에게 배운 강의">
        <p className="m-0 text-[18px] text-ink-2">강의를 고르면 그 강의에서 배우는 동작을 한꺼번에 배운 동작으로 둡니다.</p>
        {learnedCourses === null ? (
          <p className="m-0 text-ink-2">불러오는 중이에요.</p>
        ) : (
          LEARNED_COURSES.map((c) => {
            const on = learnedCourses.includes(c.id);
            const names = c.movements.map((id) => MOVEMENTS.find((m) => m.id === id)?.label ?? id).join(", ");
            return (
              <ListButton
                key={c.id}
                icon={on ? ICONS.check : ICONS.plus}
                title={c.label}
                sub={`${on ? "수강함" : "수강 안 함"} · ${names}`}
                pressed={on}
                onClick={() => void toggle(c.id, c.label)}
              />
            );
          })
        )}
      </Section>

      {error && (
        <p role="alert" className="m-0 rounded-2xl border-2 border-warn bg-warn-tint px-[18px] py-4 font-bold text-warn-ink">
          {error}
        </p>
      )}
    </>
  );
}

function movementStatus(k: MovementKnowledge | undefined, known: boolean): string {
  const how = k?.sources.includes("course") ? "강의로 배움" : k?.sources.includes("said") ? "직접 알림" : known ? "여러 번 따라 해서 익힘" : "처음";
  const practice = k?.practiceCount ? ` · ${k.practiceCount}번 따라 함` : "";
  return `${known ? "짧게 안내" : "자세히 안내"} · ${how}${practice}`;
}

/** 강사에게 배운 용어를 적어 두면 AI 맞춤 안내가 그 말로 안내한다 */
function TermsEditor({ movementId, label, initial }: { movementId: MovementId; label: string; initial: string }) {
  const { setMovementKnown, say } = useShell();
  const [terms, setTerms] = useState(initial);
  const [saving, setSaving] = useState(false);
  const id = `terms-${movementId}`;
  return (
    <form
      className="flex gap-2 pl-4 max-[640px]:flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        setSaving(true);
        void setMovementKnown(movementId, true, terms.trim())
          .then(() => say(terms.trim() ? `${label} 배운 용어를 저장했어요. 이 말로 안내할게요.` : `${label} 배운 용어를 지웠어요.`))
          .finally(() => setSaving(false));
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label} 배운 용어
      </label>
      <input
        id={id}
        className={INPUT_CLASS}
        value={terms}
        maxLength={300}
        placeholder="강사에게 배운 용어 (예: 엉덩이 의자 = 엉덩이를 뒤로 빼며 앉기)"
        onChange={(e) => setTerms(e.target.value)}
      />
      <Button type="submit" size="md" block={false} disabled={saving || terms === initial}>
        용어 저장
      </Button>
    </form>
  );
}
