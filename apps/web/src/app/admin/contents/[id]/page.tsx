"use client";

import {
  AUDIT_ACTION_LABELS,
  CONTENT_JOB_STATUS_LABELS,
  canEditContent,
  canPerformAction,
  hasBlockingIssues,
  hasPermission,
  validateExerciseContent,
  type ContentAction,
  type ContentIssue,
  type ContentJob,
  type ExerciseContent,
  type ExerciseSegment,
} from "@yconic/shared-types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfirmAction, VisibilityActions, VisibilityBadge } from "@/admin/components/content-actions";
import { ContentInfoEditor, type ContentDraft } from "@/admin/components/content-editor";
import { SegmentList, newLocalSegmentId } from "@/admin/components/segment-list";
import { isJobActive } from "@/admin/components/status-badge";
import { Alert, Button, Card, LinkButton } from "@/admin/components/ui";
import { VideoPlayer, type PlayStateReason, type VideoPlayerHandle } from "@/admin/components/video-player";
import { ReanalyzePanel, ReplaceVideoPanel } from "@/admin/components/video-tools";
import { errorMessage } from "@/admin/lib/api";
import { actionDoneMessage } from "@/admin/lib/content-plan";
import { formatBytes, formatDateTime } from "@/admin/lib/format";
import { useAdmin } from "@/admin/lib/session";
import { speak, speechSupported, stopSpeaking } from "@/admin/lib/speech";
import { nextSegmentStart, previousSegmentStart, round1, segmentIndexAt, splitSegmentAt } from "@/admin/lib/timeline";
import { useAsync, usePolling } from "@/admin/lib/use-async";
import { formatTimecode } from "@/admin/lib/video";

/**
 * 콘텐츠 편집 화면 (docs/decisions/0023).
 * 왼쪽은 탭 셋(구간 안내 · 기본 정보 · 더보기), 오른쪽은 따라다니는 영상과 "고칠 것".
 * 구간은 한 줄씩 보이고 누른 것 하나만 펼쳐진다. 맨 위의 큰 단추 하나로 공개하거나 비공개로 돌린다.
 */

function toDraft(c: ExerciseContent): ContentDraft {
  const { title, summary, category, difficulty, tags, precautions, segments, internalNote } = c;
  return structuredClone({ title, summary, category, difficulty, tags, precautions, segments, internalNote });
}

/** 사용자 경험 미리 듣기 단계: 소개·주의사항을 읽는 중 → 영상과 구간 안내 재생 중 */
type PreviewPhase = "idle" | "intro" | "playing";
type TabKey = "segments" | "info" | "more";

export default function ContentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, api } = useAdmin();

  const [content, setContent] = useState<ExerciseContent | null>(null);
  const [draft, setDraft] = useState<ContentDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabKey>("segments");
  const [openSegmentId, setOpenSegmentId] = useState<string | null>(null);
  /** 확인 창을 띄운 행동 (다시 고치기, 보관) */
  const [confirming, setConfirming] = useState<ContentAction | null>(null);

  const playerRef = useRef<VideoPlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [narrate, setNarrate] = useState(true);
  const lastSpokenRef = useRef<string | null>(null);
  /** 지금 나오는 음성이 재생 중 자동 안내인지 (정지하면 함께 끊는다) */
  const narrationSpeakingRef = useRef(false);
  const canSpeak = speechSupported();

  const [preview, setPreviewState] = useState<PreviewPhase>("idle");
  const previewRef = useRef<PreviewPhase>("idle");
  const previewRunRef = useRef(0);
  const [blackout, setBlackout] = useState(true);
  const setPreview = useCallback((p: PreviewPhase) => {
    previewRef.current = p;
    setPreviewState(p);
  }, []);

  const load = useCallback(async () => {
    try {
      const c = await api.getContent(id);
      setContent(c);
      setDraft(toDraft(c));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => stopSpeaking(), []);

  const videoId = content?.video.id ?? null;
  const playback = useAsync(() => (videoId ? api.getVideoPlaybackUrl(videoId) : Promise.resolve(null)), [api, videoId]);

  // ── 다시 분석 작업 추적 ──
  const canSeeJobs = hasPermission(user.role, "job:read");
  const jobs = useAsync(() => (canSeeJobs ? api.listJobs() : Promise.resolve([] as ContentJob[])), [api, canSeeJobs]);
  const reanalysis = useMemo(
    () => (jobs.data ?? []).filter((j) => j.kind === "REANALYZE" && j.contentId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    [jobs.data, id],
  );
  const reanalyzing = !!reanalysis && isJobActive(reanalysis.status);
  usePolling(reanalyzing, 2000, jobs.reload);
  const lastJobRef = useRef<{ id: string; active: boolean } | null>(null);
  useEffect(() => {
    if (!reanalysis) return;
    const prev = lastJobRef.current;
    const active = isJobActive(reanalysis.status);
    if (prev && prev.id === reanalysis.id && prev.active && !active) {
      if (reanalysis.status === "COMPLETED") {
        void load().then(() => setNotice("다시 분석한 결과로 바꿨습니다. 구간과 안내문을 확인해 주세요."));
      } else {
        setActionError(`다시 분석 실패: ${reanalysis.failureReason ?? "원인을 알 수 없습니다."}`);
      }
    }
    lastJobRef.current = { id: reanalysis.id, active };
  }, [reanalysis, load]);

  const dirty = useMemo(() => !!content && !!draft && JSON.stringify(toDraft(content)) !== JSON.stringify(draft), [content, draft]);
  // 구간별 음성 파일은 이제 미리 만들지 않으므로(서버 목소리, 0021) 그 경고는 보여 주지 않는다
  const issues = useMemo(() => (draft && content ? validateExerciseContent({ ...draft, video: content.video }).filter((i) => !i.field.endsWith(".tts")) : []), [draft, content]);
  const editable = !!content && canEditContent(user.role, content.status) && !reanalyzing;
  const canSeeAudit = hasPermission(user.role, "audit:read");
  const canManageVideo = !!content && hasPermission(user.role, "job:create") && canEditContent(user.role, content.status);

  const segments = useMemo(() => draft?.segments ?? [], [draft]);
  const activeIndex = segmentIndexAt(segments, currentTime);
  const activeSegment = activeIndex >= 0 ? segments[activeIndex]! : null;

  const { issuesBySegment, infoIssues, segmentIssueCount } = useMemo(() => {
    const bySegment = new Map<string, ContentIssue[]>();
    const info: ContentIssue[] = [];
    let count = 0;
    for (const issue of issues) {
      const m = /^segments\.(\d+)\./.exec(issue.field);
      const seg = m ? segments[Number(m[1])] : undefined;
      if (seg) {
        bySegment.set(seg.id, [...(bySegment.get(seg.id) ?? []), issue]);
        count += 1;
      } else if (issue.field === "segments") count += 1;
      else info.push(issue);
    }
    return { issuesBySegment: bySegment, infoIssues: info, segmentIssueCount: count };
  }, [issues, segments]);

  // 단축키에서 최신 값을 쓰기 위한 ref
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const editableRef = useRef(editable);
  editableRef.current = editable;

  // ── 재생 중 구간 안내 ──
  const narrating = playing && canSpeak && (narrate || preview === "playing");
  useEffect(() => {
    if (!narrating) return;
    const key = activeSegment?.id ?? null;
    if (key && key !== lastSpokenRef.current) {
      lastSpokenRef.current = key;
      narrationSpeakingRef.current = true;
      void speak(activeSegment!.voiceGuide);
    }
  }, [activeSegment, narrating]);

  const stopPreview = useCallback(() => {
    previewRunRef.current += 1;
    setPreview("idle");
    stopSpeaking();
    playerRef.current?.pause();
  }, [setPreview]);

  const onPlayState = useCallback(
    (p: boolean, reason: PlayStateReason) => {
      setPlaying(p);
      if (p) return;
      if (reason === "ended") {
        // 마지막 구간 안내는 끝까지 듣게 둔다.
        lastSpokenRef.current = null;
        if (previewRef.current === "playing") setPreview("idle");
        return;
      }
      if (previewRef.current === "intro") return;
      if (previewRef.current === "playing") {
        previewRunRef.current += 1;
        setPreview("idle");
      }
      if (narrationSpeakingRef.current) stopSpeaking();
      narrationSpeakingRef.current = false;
      lastSpokenRef.current = null;
    },
    [setPreview],
  );

  async function startPreview() {
    if (!draft) return;
    const run = ++previewRunRef.current;
    setPreview("intro");
    setActionError(null);
    playerRef.current?.pause();
    playerRef.current?.seek(0);
    lastSpokenRef.current = null;
    narrationSpeakingRef.current = false;
    const intro = [`${draft.title || "제목 없는 운동"}.`, draft.summary].filter(Boolean).join(" ");
    await speak(intro);
    if (previewRunRef.current !== run) return;
    if (draft.precautions.length > 0) {
      await speak(`시작하기 전에 주의사항입니다. ${draft.precautions.join(" ")}`);
      if (previewRunRef.current !== run) return;
    }
    setPreview("playing");
    playerRef.current?.play();
  }

  const auditOpen = canSeeAudit && tab === "more";
  const auditLogs = useAsync(() => (auditOpen ? api.listAuditLogs({ targetId: id }) : Promise.resolve([])), [api, id, auditOpen, content?.version]);

  // ── 단축키 ──
  const stopPreviewRef = useRef(stopPreview);
  stopPreviewRef.current = stopPreview;
  useEffect(() => {
    function updateSegment(index: number, patch: Partial<ExerciseSegment>) {
      setDraft((d) => (d ? { ...d, segments: d.segments.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : d));
    }
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, video, [role="slider"], [role="dialog"], [contenteditable="true"]')) return;
      const p = playerRef.current;
      if (!p) return;
      if (previewRef.current !== "idle") {
        if (e.code === "Escape" || e.code === "Space") {
          e.preventDefault();
          stopPreviewRef.current();
        }
        return;
      }
      const segs = draftRef.current?.segments ?? [];
      const t = p.getCurrentTime();
      const i = segmentIndexAt(segs, t);
      switch (e.code) {
        case "Space":
          if (target?.closest("button, a, summary")) return;
          p.togglePlay();
          break;
        case "ArrowLeft":
          p.seek(t - (e.shiftKey ? 1 : 5));
          break;
        case "ArrowRight":
          p.seek(t + (e.shiftKey ? 1 : 5));
          break;
        case "KeyN": {
          const n = nextSegmentStart(segs, t);
          if (n !== null) p.seek(n);
          break;
        }
        case "KeyP":
          p.seek(previousSegmentStart(segs, t));
          break;
        case "KeyL":
          if (i < 0) return;
          p.pause();
          narrationSpeakingRef.current = false;
          void speak(segs[i]!.voiceGuide);
          break;
        case "KeyS": {
          if (!editableRef.current || i < 0) return;
          const next = splitSegmentAt(segs, i, t, newLocalSegmentId);
          if (next) setDraft((d) => (d ? { ...d, segments: next } : d));
          break;
        }
        case "BracketLeft":
          if (!editableRef.current || i < 0) return;
          updateSegment(i, { startSec: round1(t) });
          break;
        case "BracketRight":
          if (!editableRef.current || i < 0) return;
          updateSegment(i, { endSec: round1(t) });
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function run(label: string | ((next: ExerciseContent) => string), fn: () => Promise<ExerciseContent>) {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const next = await fn();
      setContent(next);
      setDraft(toDraft(next));
      setNotice(typeof label === "function" ? label(next) : label);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!content || !draft) return;
    await run("저장했습니다.", () => api.updateContent(id, { ...draft, expectedVersion: content.version }));
  }

  async function onAction(action: ContentAction, comment?: string) {
    if (!content) return;
    if (dirty) {
      setActionError("저장하지 않은 변경이 있습니다. 먼저 저장하거나 되돌려 주세요.");
      return;
    }
    await run((next) => actionDoneMessage(action, next.status), () => api.changeContentStatus(id, { action, comment }));
  }

  function playSegment(s: ExerciseSegment) {
    const p = playerRef.current;
    if (!p) return;
    lastSpokenRef.current = null;
    p.seek(s.startSec);
    p.play();
  }

  function listen(s: ExerciseSegment) {
    playerRef.current?.pause();
    narrationSpeakingRef.current = false;
    void speak(s.voiceGuide);
  }

  /** 구간을 펼치고 그 자리로 간다 */
  function showSegment(segmentId: string) {
    setTab("segments");
    setOpenSegmentId(segmentId);
    requestAnimationFrame(() => document.getElementById(`segment-${segmentId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function showIssue(issue: ContentIssue) {
    const m = /^segments\.(\d+)\./.exec(issue.field);
    const seg = m ? segments[Number(m[1])] : undefined;
    if (seg) showSegment(seg.id);
    else setTab(issue.field === "segments" ? "segments" : "info");
  }

  if (loadError) {
    return (
      <>
        <Alert kind="error">{loadError}</Alert>
        <div className="mt-4">
          <LinkButton href="/admin/contents">콘텐츠 목록으로</LinkButton>
        </div>
      </>
    );
  }
  if (!content || !draft) return <p className="text-sm text-slate-500">불러오는 중…</p>;

  const errors = issues.filter((i) => i.severity === "ERROR");
  const warnings = issues.filter((i) => i.severity === "WARNING");
  const findings = content.analysis?.findings ?? [];
  const publishBlocked = reanalyzing ? "다시 분석이 끝난 뒤 공개할 수 있습니다." : hasBlockingIssues(issues) ? `고쳐야 할 것이 ${errors.length}개 있습니다.` : dirty ? "먼저 저장해 주세요." : null;
  const confirmNote = warnings.length > 0 ? `확인이 필요한 것 ${warnings.length}개가 남아 있습니다. 그대로 공개할 수도 있습니다.` : null;
  const videoLockedReason = reanalyzing ? "다시 분석이 진행 중입니다." : dirty ? "먼저 저장하거나 되돌려 주세요." : busy ? "다른 작업을 처리하는 중입니다." : null;
  const locked = !canEditContent(user.role, content.status) && hasPermission(user.role, "content:edit") && content.status !== "ARCHIVED";
  const canRevise = canPerformAction(user.role, content.status, "REVISE");
  const canArchive = canPerformAction(user.role, content.status, "ARCHIVE");

  const tabs: { key: TabKey; label: string; mark: boolean }[] = [
    { key: "segments", label: `구간 안내 ${segments.length}`, mark: segmentIssueCount > 0 },
    { key: "info", label: "기본 정보", mark: infoIssues.length > 0 },
    { key: "more", label: "더보기", mark: false },
  ];

  return (
    <div className={dirty ? "pb-20" : ""}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/contents" className="text-sm text-slate-500 hover:text-blue-700 hover:underline">
            ← 콘텐츠
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[26px] font-extrabold leading-tight">
            <span className="min-w-0 break-words">{draft.title || "(제목 없음)"}</span>
            <VisibilityBadge status={content.status} />
          </h1>
        </div>
        <VisibilityActions user={user} content={content} publishBlocked={publishBlocked} confirmNote={confirmNote} busy={busy} onAction={onAction} />
      </div>

      <div className="mb-4 space-y-2 empty:hidden">
        {actionError && <Alert kind="error">{actionError}</Alert>}
        {notice && !actionError && <Alert kind="success">{notice}</Alert>}
        {content.reviewComment && content.status === "CHANGES_REQUESTED" && (
          <Alert kind="warning">
            <span className="font-bold">돌려보낸 까닭:</span> {content.reviewComment}
          </Alert>
        )}
        {reanalyzing && reanalysis && (
          <Alert kind="info">
            <span className="font-bold">다시 분석하는 중:</span> {CONTENT_JOB_STATUS_LABELS[reanalysis.status]} ({reanalysis.progress}%). 끝나면 구간과 안내문이 새 결과로 바뀝니다. 그동안은 고칠 수 없습니다.
          </Alert>
        )}
        {locked && (
          <Alert kind="info">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {content.status === "PUBLISHED" && "공개 중에는 고칠 수 없습니다. 사용자가 보는 내용이 도중에 바뀌지 않게 하기 위해서입니다."}
                {content.status === "APPROVED" && "승인된 내용이라 고칠 수 없습니다. 고치면 다시 공개해야 합니다."}
                {content.status === "IN_REVIEW" && "공개 요청 중에는 고칠 수 없습니다. 고치려면 먼저 돌려보내 주세요."}
              </span>
              {canRevise && (
                <Button className="px-3 py-1.5" disabled={busy} onClick={() => setConfirming("REVISE")}>
                  {content.status === "PUBLISHED" ? "비공개로 돌려 고치기" : "고치기"}
                </Button>
              )}
            </span>
          </Alert>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* 영상: 좁은 화면에서는 위에, 넓은 화면에서는 오른쪽에 따라다닌다 */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:order-2 lg:self-start">
          <section aria-label="영상" className="rounded-2xl border-2 border-slate-200 bg-white p-3">
            {preview !== "idle" && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 px-3 py-2 text-sm" role="status">
                <span className="font-bold">{preview === "intro" ? "제목과 주의사항을 읽는 중" : "영상과 안내를 재생하는 중"}</span>
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={blackout} onChange={(e) => setBlackout(e.target.checked)} />
                    화면 가리기
                  </label>
                  <Button className="px-2.5 py-1" onClick={stopPreview}>
                    ■ 멈춤
                  </Button>
                </span>
              </div>
            )}
            <VideoPlayer
              ref={playerRef}
              src={playback.data ?? null}
              loadingSrc={playback.loading}
              durationSec={content.video.durationSec}
              segments={segments}
              activeSegmentId={activeSegment?.id ?? null}
              currentTime={currentTime}
              onTimeUpdate={setCurrentTime}
              onPlayStateChange={onPlayState}
              onSegmentClick={(s) => {
                playerRef.current?.seek(s.startSec);
                showSegment(s.id);
              }}
              blackout={preview !== "idle" && blackout}
              editable={editable}
              onSegmentsChange={(next) => setDraft((d) => (d ? { ...d, segments: next } : d))}
            />
            {activeSegment && (
              <button type="button" onClick={() => showSegment(activeSegment.id)} className="mt-3 block w-full rounded-xl bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100" title="이 구간을 펼쳐 고칩니다">
                <span className="font-bold">
                  지금 {activeSegment.order}구간 · {activeSegment.title || "(제목 없음)"}
                </span>
                <span className="mt-0.5 line-clamp-3 block text-slate-600">{activeSegment.voiceGuide || "음성 안내문이 없습니다."}</span>
              </button>
            )}
            {canSpeak && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={narrate} onChange={(e) => setNarrate(e.target.checked)} />
                  재생할 때 안내 읽기
                </label>
                {preview === "idle" && (
                  <Button className="px-3 py-1.5" onClick={() => void startPreview()} title="화면을 가리고 처음부터, 사용자가 듣는 그대로 들어 봅니다">
                    <span aria-hidden>▶</span> 사용자처럼 들어 보기
                  </Button>
                )}
              </div>
            )}
          </section>

          <section aria-label="고칠 것" className="rounded-2xl border-2 border-slate-200 bg-white p-3">
            {errors.length === 0 && warnings.length === 0 ? (
              <p className="text-sm font-bold text-green-800">
                <span aria-hidden>✓ </span>고칠 것이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {errors.length > 0 && <IssueList title={`공개하려면 고쳐야 합니다 (${errors.length})`} tone="error" issues={errors} onPick={showIssue} />}
                {warnings.length > 0 && <IssueList title={`확인해 보세요 (${warnings.length})`} tone="warning" issues={warnings} onPick={showIssue} collapsed={errors.length > 0 || warnings.length > 3} />}
              </div>
            )}
            {findings.length > 0 && (
              <details className="mt-3 border-t-2 border-slate-200 pt-3 text-sm">
                <summary className="cursor-pointer select-none font-bold text-slate-600">화면으로만 전달되던 정보 {findings.length}건 (AI가 찾음)</summary>
                <p className="mt-1 text-xs text-slate-500">아래 내용이 음성 안내에 들어갔는지 확인해 주세요.</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
                  {findings.map((f, i) => (
                    <li key={i}>
                      {f.kind} — {f.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </aside>

        <div className="min-w-0 lg:order-1">
          <div role="tablist" aria-label="고칠 내용" className="mb-3 flex flex-wrap gap-1 border-b-2 border-slate-200">
            {tabs.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  id={`tab-${t.key}`}
                  aria-selected={active}
                  aria-controls={`panel-${t.key}`}
                  onClick={() => setTab(t.key)}
                  className={`-mb-0.5 border-b-[3px] px-3 py-2 text-[15px] ${active ? "border-blue-600 font-extrabold text-blue-700" : "border-transparent font-bold text-slate-500 hover:text-slate-800"}`}
                >
                  {t.label}
                  {t.mark && (
                    <span className="ml-1 text-amber-700" aria-label="고칠 것 있음">
                      ⚠
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === "segments" && (
              <>
                <p className="mb-3 text-sm text-slate-500">사용자 앱은 영상을 틀다가 구간이 시작될 때 그 구간의 음성 안내문을 읽어 줍니다. 구간을 누르면 펼쳐서 고칠 수 있습니다.</p>
                <SegmentList
                  segments={segments}
                  durationSec={content.video.durationSec}
                  onChange={(next) => setDraft({ ...draft, segments: next })}
                  editable={editable}
                  openId={openSegmentId}
                  onOpen={(segmentId) => {
                    setOpenSegmentId(segmentId);
                    const s = segments.find((x) => x.id === segmentId);
                    // 펼친 구간이 영상에서 어디인지 바로 보이게 그 자리로 옮긴다 (재생 중이면 그대로 둔다)
                    if (s && !playing) playerRef.current?.seek(s.startSec);
                  }}
                  activeSegmentId={playing ? (activeSegment?.id ?? null) : null}
                  issuesBySegment={issuesBySegment}
                  getCurrentTime={() => playerRef.current?.getCurrentTime() ?? currentTime}
                  onPlaySegment={playSegment}
                  onListen={listen}
                  speechSupported={canSpeak}
                />
              </>
            )}

            {tab === "info" && <ContentInfoEditor draft={draft} onChange={setDraft} editable={editable} />}

            {tab === "more" && (
              <div className="space-y-4">
                <Card title="영상 파일">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <Row label="파일">{content.video.fileName}</Row>
                    <Row label="길이">{formatTimecode(content.video.durationSec)}</Row>
                    <Row label="해상도">
                      {content.video.width}×{content.video.height}
                    </Row>
                    <Row label="크기">{formatBytes(content.video.sizeBytes)}</Row>
                    <Row label="올린 날짜">{formatDateTime(content.video.uploadedAt)}</Row>
                  </dl>
                  {content.analysis && (
                    <p className="mt-3 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600">
                      <span className="font-bold text-slate-700">AI 분석 ({content.analysis.provider})</span> · {formatDateTime(content.analysis.analyzedAt)}
                      <span className="mt-0.5 block">{content.analysis.summary}</span>
                    </p>
                  )}
                  {canManageVideo && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <ReplaceVideoPanel
                        api={api}
                        content={content}
                        lockedReason={videoLockedReason}
                        onError={setActionError}
                        onReplaced={(next) => {
                          setContent(next);
                          setDraft(toDraft(next));
                          setActionError(null);
                          setNotice(`영상을 ${next.video.fileName}(으)로 바꿨습니다. 구간이 새 영상과 맞는지 확인해 주세요.`);
                        }}
                      />
                      <ReanalyzePanel
                        api={api}
                        content={content}
                        lockedReason={videoLockedReason}
                        onError={setActionError}
                        onStarted={() => {
                          setActionError(null);
                          setNotice(null);
                          void jobs.reload({ silent: true });
                        }}
                      />
                    </div>
                  )}
                </Card>

                <Card title="날짜">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <Row label="만든 날짜">{formatDateTime(content.createdAt)}</Row>
                    <Row label="마지막으로 고친 날짜">{formatDateTime(content.updatedAt)}</Row>
                    <Row label="공개한 날짜">{formatDateTime(content.publishedAt)}</Row>
                  </dl>
                </Card>

                {canSeeAudit && (
                  <Card title="기록">
                    {auditLogs.data && auditLogs.data.length === 0 && <p className="text-sm text-slate-500">기록이 없습니다.</p>}
                    <ul className="space-y-2 text-sm">
                      {(auditLogs.data ?? []).map((l) => (
                        <li key={l.id} className="border-l-2 border-slate-200 pl-2.5">
                          <p className="font-bold">
                            {AUDIT_ACTION_LABELS[l.action]} · {l.actorName}
                          </p>
                          <p className="text-slate-600">{l.summary}</p>
                          <p className="text-xs text-slate-400">{formatDateTime(l.createdAt)}</p>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                <Card title="키보드로 다루기">
                  <ul className="grid gap-x-4 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
                    <li>
                      <Kbd>Space</Kbd> 재생 / 멈춤
                    </li>
                    <li>
                      <Kbd>←</Kbd> <Kbd>→</Kbd> 5초 이동 (<Kbd>Shift</Kbd> 1초)
                    </li>
                    <li>
                      <Kbd>N</Kbd> / <Kbd>P</Kbd> 다음 / 이전 구간
                    </li>
                    <li>
                      <Kbd>L</Kbd> 지금 구간 안내 듣기
                    </li>
                    <li>
                      <Kbd>S</Kbd> 지금 위치에서 구간 나누기
                    </li>
                    <li>
                      <Kbd>[</Kbd> / <Kbd>]</Kbd> 지금 구간의 시작 / 끝을 지금 위치로
                    </li>
                    <li className="sm:col-span-2">영상 아래 띠의 흰 경계선을 끌면 구간의 시작과 끝이 바뀝니다. 글을 쓰는 중에는 단축키가 듣지 않습니다.</li>
                  </ul>
                </Card>

                {canArchive && (
                  <Card title="보관">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-slate-600">더 쓰지 않는 영상은 보관합니다. 목록의 &lsquo;보관&rsquo; 탭에서 다시 꺼낼 수 있습니다.</p>
                      <Button variant="danger" disabled={busy || dirty} title={dirty ? "먼저 저장하거나 되돌려 주세요." : undefined} onClick={() => setConfirming("ARCHIVE")}>
                        보관하기
                      </Button>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {confirming && (
        <ConfirmAction
          action={confirming}
          status={content.status}
          busy={busy}
          onConfirm={() => void onAction(confirming).then(() => setConfirming(null))}
          onCancel={() => setConfirming(null)}
        />
      )}

      {editable && dirty && (
        <div role="region" aria-label="저장" className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-slate-300 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="text-sm font-bold text-amber-700">저장하지 않은 변경이 있습니다.</p>
            <div className="flex gap-2">
              <Button onClick={() => setDraft(toDraft(content))} disabled={busy}>
                되돌리기
              </Button>
              <Button variant="primary" className="px-6" onClick={() => void save()} disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IssueList({ title, tone, issues, onPick, collapsed = false }: { title: string; tone: "error" | "warning"; issues: ContentIssue[]; onPick(issue: ContentIssue): void; collapsed?: boolean }) {
  const color = tone === "error" ? "text-red-700" : "text-amber-700";
  const list = (
    <ul className="mt-1 space-y-0.5 text-sm">
      {issues.map((issue, i) => (
        <li key={i}>
          <button type="button" onClick={() => onPick(issue)} className="text-left text-slate-600 hover:text-blue-700 hover:underline">
            {issue.message}
          </button>
        </li>
      ))}
    </ul>
  );
  if (collapsed) {
    return (
      <details>
        <summary className={`cursor-pointer select-none text-sm font-bold ${color}`}>{title}</summary>
        {list}
      </details>
    );
  }
  return (
    <div>
      <p className={`text-sm font-bold ${color}`}>{title}</p>
      {list}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-[11px]">{children}</kbd>;
}
