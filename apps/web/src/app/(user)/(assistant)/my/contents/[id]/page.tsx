"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  canCreatorEdit,
  CONTENT_STATUS_LABELS,
  creatorSubmitBlockedReason,
  EXERCISE_CATEGORY_LABELS,
  findVisualOnlyPhrases,
  type MyContent,
} from "@yconic/shared-types";
import { creatorStatusNote, LoginRequired } from "@/user/components/creator-ui";
import { Button, Caution, ICONS, Section } from "@/user/components/ui";
import { createCreatorApi, creatorErrorMessage } from "@/user/lib/creator-api";
import { usePage, usePageCommands, useShell } from "@/user/lib/shell";

/**
 * 콘텐츠 확인 (/my/contents/[id]).
 * 화면에서만 전달되던 정보를 보고 단계별 음성 안내를 고친 뒤, 확인 표시를 하고 검수를 요청한다.
 * 검수 중·승인·공개 상태에서는 읽기만 한다.
 */
export default function MyContentPage() {
  const { account, say } = useShell();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const api = useMemo(() => createCreatorApi(), []);
  const [content, setContent] = useState<MyContent | null>(null);
  const [guides, setGuides] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(
    (c: MyContent) => {
      setContent(c);
      setGuides(Object.fromEntries(c.segments.map((s) => [s.id, s.voiceGuide])));
    },
    [setContent],
  );

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    api
      .getMyContent(id)
      .then((c) => !cancelled && load(c))
      .catch((e) => !cancelled && setError(creatorErrorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [account, api, id, load]);

  usePage({
    mode: "supply",
    title: content ? content.title : "콘텐츠 확인",
    chips: content && canCreatorEdit(content) ? ["전체 미리 듣기", "검수 요청", "내 콘텐츠"] : ["내 콘텐츠", "새 콘텐츠"],
  });

  const editable = content ? canCreatorEdit(content) : false;
  /** 지금 화면에 쓴 안내를 반영한 콘텐츠 (검사용) */
  const draft = useMemo(
    () => (content ? { ...content, segments: content.segments.map((s) => ({ ...s, voiceGuide: guides[s.id] ?? s.voiceGuide })) } : null),
    [content, guides],
  );
  const changed = !!content && content.segments.some((s) => (guides[s.id] ?? s.voiceGuide) !== s.voiceGuide);

  const previewAll = useCallback(() => {
    if (!draft) return;
    void say(`${draft.title}. ${draft.segments.map((s, i) => `${i + 1}단계, ${s.title}. ${s.voiceGuide || "안내 없음"}`).join(" ")}`);
  }, [draft, say]);

  /** 고친 안내를 저장한다. 바뀐 것이 없으면 그대로 돌려준다 */
  const save = useCallback(async (): Promise<MyContent | null> => {
    if (!content || !changed) return content;
    const updated = await api.updateMyGuides(content.id, {
      expectedVersion: content.version,
      segments: content.segments.filter((s) => guides[s.id] !== s.voiceGuide).map((s) => ({ id: s.id, voiceGuide: guides[s.id] ?? "" })),
    });
    load(updated);
    return updated;
  }, [api, changed, content, guides, load]);

  const run = useCallback(
    async (what: "save" | "submit") => {
      if (!content || !draft || busy) return;
      setError(null);
      setSaved(null);
      if (what === "submit") {
        const blocked = creatorSubmitBlockedReason(draft, confirmed);
        if (blocked) {
          setError(blocked);
          void say(blocked);
          return;
        }
      }
      setBusy(true);
      try {
        const latest = await save();
        if (what === "save") {
          setSaved("고친 안내를 저장했습니다.");
          void say("고친 안내를 저장했습니다.");
          return;
        }
        const sent = await api.submitMyContent(content.id, { expectedVersion: latest!.version, confirmed });
        load(sent);
        void say(`${sent.title} 검수를 요청했습니다. 운영자가 승인하면 운동하기 화면에 공개됩니다.`);
        router.push("/my/contents");
      } catch (e) {
        setError(creatorErrorMessage(e));
        void say(creatorErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [api, busy, confirmed, content, draft, load, router, save, say],
  );

  usePageCommands((text) => {
    if (!content) return false;
    if (/미리 듣기|들려줘|읽어줘/.test(text)) {
      previewAll();
      return true;
    }
    if (text.includes("검수") && editable) {
      void run("submit");
      return true;
    }
    return false;
  });

  if (!account) return <LoginRequired />;
  if (error && !content) {
    return (
      <p role="alert" className="m-0 text-ink-2">
        콘텐츠를 불러오지 못했어요. {error}
      </p>
    );
  }
  if (!content || !draft) return <p className="m-0 text-ink-2">불러오는 중이에요.</p>;

  const findings = content.analysis?.findings ?? [];
  return (
    <>
      <Section id="status-title" title={`상태: ${CONTENT_STATUS_LABELS[content.status]}`}>
        <p className="m-0 rounded-2xl border-2 border-control bg-panel px-5 py-4 text-[19px]">
          {creatorStatusNote(content)}
          <br />
          <span className="text-[17px] text-ink-3">
            {EXERCISE_CATEGORY_LABELS[content.category]} · 단계 {content.segments.length}개 · 영상 {content.video.fileName}
          </span>
        </p>
      </Section>

      {findings.length > 0 && (
        <section aria-labelledby="findings-title" className="flex flex-col gap-3.5 rounded-2xl border-2 border-line bg-panel px-5 py-[18px]">
          <h2 id="findings-title" className="m-0 text-[20px] font-extrabold text-accent">
            화면에서만 전달되던 정보 {findings.length}건
          </h2>
          <ul className="m-0 flex flex-col gap-1.5 pl-[22px] text-[18px] text-ink-2">
            {findings.map((f, i) => (
              <li key={i}>
                <span className="font-bold text-ink">{f.kind}.</span> {f.text}
              </li>
            ))}
          </ul>
          <p className="m-0 text-[17px] text-ink-3">아래 음성 안내에 이 내용이 들어갔는지 확인해 주세요.</p>
        </section>
      )}

      <Section id="draft-title" title={editable ? "단계별 음성 안내 초안 (고칠 수 있음)" : "단계별 음성 안내"}>
        {draft.segments.map((s, i) => {
          const visual = findVisualOnlyPhrases(s.voiceGuide);
          const fieldId = `draft-${s.id}`;
          return (
            <div key={s.id} className="flex flex-col gap-3.5">
              <label htmlFor={fieldId} className="text-[20px] font-bold">
                {i + 1}단계. {s.title}
              </label>
              <textarea
                id={fieldId}
                rows={3}
                value={s.voiceGuide}
                readOnly={!editable}
                onChange={(e) => setGuides((g) => ({ ...g, [s.id]: e.target.value }))}
                aria-describedby={visual.length ? `${fieldId}-warn` : undefined}
                className="w-full resize-y rounded-[14px] border-[3px] border-ink bg-panel px-4 py-3.5 text-[19px] leading-normal text-ink read-only:border-control"
              />
              {visual.length > 0 && (
                <p id={`${fieldId}-warn`} className="m-0 rounded-xl border-2 border-warn bg-warn-tint px-4 py-3 text-[17px] text-warn-ink">
                  <span className="font-bold">고쳐야 할 표현.</span> {visual.map((v) => `"${v}"`).join(", ")}는 화면을 봐야 알 수 있습니다. 방향·위치·횟수를 말로 바꿔 주세요.
                </p>
              )}
              <Button tone="soft" icon={ICONS.speaker} onClick={() => void say(`${i + 1}단계, ${s.title}. ${s.voiceGuide || "안내 없음"}`)}>
                {i + 1}단계 미리 듣기
              </Button>
            </div>
          );
        })}
        <Button tone="info" size="lg" icon={ICONS.speakerWide} onClick={previewAll}>
          전체 미리 듣기
        </Button>
      </Section>

      {editable && (
        <Section id="submit-title" title="검수 요청">
          {changed && (
            <Button size="lg" icon={ICONS.check} onClick={() => void run("save")} disabled={busy}>
              고친 안내 저장
            </Button>
          )}
          <label htmlFor="confirm-check" className="flex min-h-[68px] items-center gap-4 rounded-2xl border-2 border-control bg-panel px-[18px] py-4 text-[19px]">
            <input
              id="confirm-check"
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="h-8 w-8 flex-none accent-accent"
            />
            <span>동작 설명이 정확하고 안전한지 직접 확인했습니다.</span>
          </label>
          {error && (
            <p role="alert" className="m-0 rounded-2xl border-2 border-warn bg-warn-tint px-[18px] py-4 font-bold text-warn-ink">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="m-0 text-[18px] text-info">
              {saved}
            </p>
          )}
          <Button tone="primary" size="xl" icon={ICONS.send} onClick={() => void run("submit")} disabled={busy} aria-busy={busy}>
            {busy ? "보내는 중…" : "검수 요청하기"}
          </Button>
          <p className="m-0 text-[17px] text-ink-3">올린 사람은 직접 공개할 수 없습니다. 운영자가 검수하고 승인하면 운동하기 화면에 나타납니다.</p>
        </Section>
      )}

      {content.status === "CHANGES_REQUESTED" && content.reviewComment && (
        <Caution label="검수 의견">{content.reviewComment}</Caution>
      )}
    </>
  );
}
