"use client";

import {
  AUDIT_ACTION_LABELS,
  CONTENT_JOB_STATUS_LABELS,
  CONTENT_STATUS_LABELS,
  canEditContent,
  hasBlockingIssues,
  hasPermission,
  validateExerciseContent,
  type ContentAction,
  type ContentJob,
  type ExerciseContent,
  type ExerciseSegment,
} from "@yconic/shared-types";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ContentActions } from "@/components/content-actions";
import { ContentInfoEditor, type ContentDraft } from "@/components/content-editor";
import { SegmentEditor, newLocalSegmentId } from "@/components/segment-editor";
import { ContentStatusBadge, isJobActive } from "@/components/status-badge";
import { Alert, Button, Card, LinkButton, PageHeader } from "@/components/ui";
import { ValidationPanel } from "@/components/validation-panel";
import { VideoPlayer, type PlayStateReason, type VideoPlayerHandle } from "@/components/video-player";
import { ReanalyzePanel, ReplaceVideoPanel } from "@/components/video-tools";
import { errorMessage } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useAdmin } from "@/lib/session";
import { speak, speechSupported, stopSpeaking } from "@/lib/speech";
import { nextSegmentStart, previousSegmentStart, round1, segmentIndexAt, splitSegmentAt } from "@/lib/timeline";
import { useAsync, usePolling } from "@/lib/use-async";
import { formatTimecode } from "@/lib/video";

function toDraft(c: ExerciseContent): ContentDraft {
  const { title, summary, category, difficulty, tags, precautions, segments, internalNote } = c;
  return structuredClone({ title, summary, category, difficulty, tags, precautions, segments, internalNote });
}

/** 사용자 경험 미리 듣기 단계: 소개·주의사항을 읽는 중 → 영상과 구간 안내 재생 중 */
type PreviewPhase = "idle" | "intro" | "playing";

export default function ContentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, api } = useAdmin();
  const router = useRouter();

  const [content, setContent] = useState<ExerciseContent | null>(null);
  const [draft, setDraft] = useState<ContentDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        void load().then(() => setNotice("다시 분석 결과를 반영했습니다. 구간과 안내문을 확인해 주세요."));
      } else {
        setActionError(`다시 분석 실패: ${reanalysis.failureReason ?? "원인을 알 수 없습니다."}`);
      }
    }
    lastJobRef.current = { id: reanalysis.id, active };
  }, [reanalysis, load]);

  const dirty = useMemo(() => !!content && !!draft && JSON.stringify(toDraft(content)) !== JSON.stringify(draft), [content, draft]);
  const issues = useMemo(() => (draft && content ? validateExerciseContent({ ...draft, video: content.video }) : []), [draft, content]);
  const editable = !!content && canEditContent(user.role, content.status) && !reanalyzing;
  const canRequestTts = hasPermission(user.role, "tts:request");
  const canSeeAudit = hasPermission(user.role, "audit:read");
  const canManageVideo = !!content && hasPermission(user.role, "job:create") && canEditContent(user.role, content.status);

  const segments = useMemo(() => draft?.segments ?? [], [draft]);
  const activeIndex = segmentIndexAt(segments, currentTime);
  const activeSegment = activeIndex >= 0 ? segments[activeIndex]! : null;

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

  // 음성 생성 중이면 상태만 조용히 갱신한다. 편집 중인 내용은 유지하고 tts 필드만 반영한다.
  const generating = !!content?.segments.some((s) => s.tts.status === "GENERATING" || s.tts.status === "REQUESTED");
  const pollReload = useCallback(async () => {
    const fresh = await api.getContent(id);
    setContent(fresh);
    setDraft((d) => {
      if (!d) return toDraft(fresh);
      const byId = new Map(fresh.segments.map((s) => [s.id, s.tts]));
      return { ...d, segments: d.segments.map((s) => ({ ...s, tts: byId.get(s.id) ?? s.tts })) };
    });
  }, [api, id]);
  usePolling(generating, 1500, useCallback(() => pollReload().catch(() => undefined), [pollReload]));

  const auditLogs = useAsync(() => (canSeeAudit ? api.listAuditLogs({ targetId: id }) : Promise.resolve([])), [api, id, canSeeAudit, content?.version]);

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
      if (target?.closest('input, textarea, select, video, [role="slider"], [contenteditable="true"]')) return;
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
          if (target?.closest("button, a")) return;
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
    await run((next) => `상태를 "${CONTENT_STATUS_LABELS[next.status]}"(으)로 바꿨습니다.`, () => api.changeContentStatus(id, { action, comment }));
  }

  async function onRequestTts(segmentIds: string[]) {
    await run("음성 생성을 요청했습니다. 잠시 뒤 자동으로 갱신됩니다.", () => api.requestTts(id, { segmentIds }));
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

  if (loadError) {
    return (
      <>
        <Alert kind="error">{loadError}</Alert>
        <div className="mt-4">
          <LinkButton href="/contents">목록으로</LinkButton>
        </div>
      </>
    );
  }
  if (!content || !draft) return <p className="text-sm text-slate-500">불러오는 중…</p>;

  const submitBlockedReason = reanalyzing
    ? "다시 분석이 끝난 뒤 검수를 요청할 수 있습니다."
    : hasBlockingIssues(issues)
      ? "누락이나 형식 오류를 고친 뒤 검수를 요청할 수 있습니다."
      : dirty
        ? "저장하지 않은 변경이 있습니다."
        : null;
  const videoLockedReason = reanalyzing ? "다시 분석이 진행 중입니다." : dirty ? "저장하지 않은 변경이 있습니다. 먼저 저장하거나 되돌려 주세요." : busy ? "다른 작업을 처리하는 중입니다." : null;

  return (
    <>
      <PageHeader
        title={content.title || "(제목 없음)"}
        description={`${content.video.fileName} · ${formatTimecode(content.video.durationSec)} · 구간 ${content.segments.length}개 · 버전 ${content.version}`}
        actions={
          <>
            <ContentStatusBadge status={content.status} />
            <LinkButton href="/contents">목록</LinkButton>
          </>
        }
      />

      {content.reviewComment && content.status === "CHANGES_REQUESTED" && (
        <Banner>
          <Alert kind="warning">
            <span className="font-medium">검수 의견:</span> {content.reviewComment}
          </Alert>
        </Banner>
      )}
      {reanalyzing && reanalysis && (
        <Banner>
          <Alert kind="info">
            <span className="font-medium">다시 분석 중:</span> {CONTENT_JOB_STATUS_LABELS[reanalysis.status]} ({reanalysis.progress}%). 끝나면 구간과 안내문이 새 결과로 바뀝니다. 그동안 수정과 검수 요청은 잠깁니다.
          </Alert>
        </Banner>
      )}
      {!canEditContent(user.role, content.status) && hasPermission(user.role, "content:edit") && content.status !== "ARCHIVED" && (
        <Banner>
          <Alert kind="info">{CONTENT_STATUS_LABELS[content.status]} 상태에서는 내용을 고칠 수 없습니다. 검수한 내용과 공개 내용이 달라지지 않게 하기 위해서입니다.</Alert>
        </Banner>
      )}
      {actionError && (
        <Banner>
          <Alert kind="error">{actionError}</Alert>
        </Banner>
      )}
      {notice && !actionError && (
        <Banner>
          <Alert kind="success">{notice}</Alert>
        </Banner>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <Card
            title="영상과 구간"
            actions={
              canSpeak && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={narrate} onChange={(e) => setNarrate(e.target.checked)} />
                    재생 중 구간 안내
                  </label>
                  {preview === "idle" && (
                    <Button variant="primary" onClick={() => void startPreview()}>
                      ▶ 사용자 경험 미리 듣기
                    </Button>
                  )}
                </>
              )
            }
          >
            {preview !== "idle" && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm" role="status">
                <span>
                  <span className="font-medium">사용자 경험 미리 듣기 중</span> · {preview === "intro" ? "제목·요약과 주의사항을 읽는 중" : "영상과 구간 안내 재생 중"}
                </span>
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={blackout} onChange={(e) => setBlackout(e.target.checked)} />
                    화면 가리기
                  </label>
                  <Button onClick={stopPreview}>■ 정지 (Esc)</Button>
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
                document.getElementById(`segment-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }}
              blackout={preview !== "idle" && blackout}
              editable={editable}
              onSegmentsChange={(next) => setDraft((d) => (d ? { ...d, segments: next } : d))}
            />
            {activeSegment && (
              <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium">
                  지금 구간 {activeSegment.order}. {activeSegment.title}:
                </span>{" "}
                <span className="text-slate-700">{activeSegment.voiceGuide || "(안내문 없음)"}</span>
              </p>
            )}
            <details className="mt-2 text-xs text-slate-600">
              <summary className="cursor-pointer select-none">단축키와 사용법</summary>
              <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                <li>
                  <Kbd>Space</Kbd> 재생 / 정지
                </li>
                <li>
                  <Kbd>←</Kbd> <Kbd>→</Kbd> 5초 이동 (<Kbd>Shift</Kbd> 1초)
                </li>
                <li>
                  <Kbd>N</Kbd> / <Kbd>P</Kbd> 다음 / 이전 구간으로
                </li>
                <li>
                  <Kbd>L</Kbd> 지금 구간 안내 듣기
                </li>
                {editable && (
                  <>
                    <li>
                      <Kbd>S</Kbd> 지금 시각에서 구간 나누기
                    </li>
                    <li>
                      <Kbd>[</Kbd> / <Kbd>]</Kbd> 지금 구간의 시작 / 끝을 지금 시각으로
                    </li>
                    <li className="sm:col-span-2">타임라인의 흰 경계선을 끌거나, 경계선을 Tab으로 고른 뒤 방향키로 1초씩(Shift 0.1초) 옮길 수 있습니다.</li>
                  </>
                )}
                <li className="sm:col-span-2">
                  미리 듣기는 브라우저 내장 음성을 씁니다. 실제 사용자에게는 생성된 음성 파일이 재생됩니다. 입력 칸에 글을 쓰는 중에는 단축키가 동작하지 않습니다.
                </li>
              </ul>
            </details>
          </Card>

          <SegmentEditor
            segments={segments}
            durationSec={content.video.durationSec}
            onChange={(next) => setDraft({ ...draft, segments: next })}
            editable={editable}
            dirty={dirty}
            canRequestTts={canRequestTts}
            onRequestTts={(ids) => void onRequestTts(ids)}
            activeSegmentId={activeSegment?.id ?? null}
            getCurrentTime={() => playerRef.current?.getCurrentTime() ?? currentTime}
            onPlaySegment={playSegment}
            onListen={listen}
            speechSupported={canSpeak}
          />

          <ContentInfoEditor draft={draft} onChange={setDraft} editable={editable} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {editable && (
            <Card title="저장">
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => void save()} disabled={!dirty || busy}>
                  저장
                </Button>
                <Button onClick={() => setDraft(toDraft(content))} disabled={!dirty || busy}>
                  되돌리기
                </Button>
              </div>
              {dirty && <p className="mt-2 text-xs text-amber-700">저장하지 않은 변경이 있습니다.</p>}
            </Card>
          )}

          <Card title="검사 결과">
            <ValidationPanel issues={issues} />
          </Card>

          <Card title="상태 변경">
            <ContentActions role={user.role} status={content.status} submitBlockedReason={submitBlockedReason} busy={busy} onAction={onAction} />
          </Card>

          <Card title="영상">
            <dl className="space-y-1 text-sm">
              <Row label="파일">{content.video.fileName}</Row>
              <Row label="길이">{formatTimecode(content.video.durationSec)}</Row>
              <Row label="해상도">
                {content.video.width}×{content.video.height}
              </Row>
              <Row label="크기">{formatBytes(content.video.sizeBytes)}</Row>
              <Row label="올린 날짜">{formatDateTime(content.video.uploadedAt)}</Row>
            </dl>
            {content.analysis && (
              <div className="mt-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                <p className="font-medium text-slate-700">AI 분석 ({content.analysis.provider})</p>
                <p>{content.analysis.summary}</p>
                <p className="text-slate-400">{formatDateTime(content.analysis.analyzedAt)}</p>
              </div>
            )}
            {canManageVideo && (
              <div className="mt-3 space-y-2">
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

          <Card title="콘텐츠 정보">
            <dl className="space-y-1 text-sm">
              <Row label="만든 날짜">{formatDateTime(content.createdAt)}</Row>
              <Row label="마지막 수정">{formatDateTime(content.updatedAt)}</Row>
              <Row label="공개 날짜">{formatDateTime(content.publishedAt)}</Row>
            </dl>
          </Card>

          {canSeeAudit && (
            <Card title="이력">
              {auditLogs.data && auditLogs.data.length === 0 && <p className="text-sm text-slate-500">기록이 없습니다.</p>}
              <ul className="space-y-2 text-xs">
                {(auditLogs.data ?? []).map((l) => (
                  <li key={l.id} className="border-l-2 border-slate-200 pl-2">
                    <p className="font-medium">
                      {AUDIT_ACTION_LABELS[l.action]} · {l.actorName}
                    </p>
                    <p className="text-slate-600">{l.summary}</p>
                    <p className="text-slate-400">{formatDateTime(l.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Button variant="ghost" className="w-full" onClick={() => router.push("/contents")}>
            목록으로 돌아가기
          </Button>
        </aside>
      </div>
    </>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return <div className="mb-4">{children}</div>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="truncate text-right">{children}</dd>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-[11px]">{children}</kbd>;
}
