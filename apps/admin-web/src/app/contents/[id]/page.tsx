"use client";

import {
  AUDIT_ACTION_LABELS,
  CONTENT_STATUS_LABELS,
  canEditContent,
  hasBlockingIssues,
  hasPermission,
  validateExerciseContent,
  type ContentAction,
  type ExerciseContent,
  type ExerciseSegment,
} from "@yconic/shared-types";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContentActions } from "@/components/content-actions";
import { ContentInfoEditor, type ContentDraft } from "@/components/content-editor";
import { SegmentEditor } from "@/components/segment-editor";
import { ContentStatusBadge } from "@/components/status-badge";
import { Alert, Button, Card, LinkButton, PageHeader } from "@/components/ui";
import { ValidationPanel } from "@/components/validation-panel";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video-player";
import { errorMessage } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useAdmin } from "@/lib/session";
import { speak, speechSupported, stopSpeaking } from "@/lib/speech";
import { useAsync, usePolling } from "@/lib/use-async";
import { formatTimecode } from "@/lib/video";

function toDraft(c: ExerciseContent): ContentDraft {
  const { title, summary, category, difficulty, tags, precautions, segments, internalNote } = c;
  return structuredClone({ title, summary, category, difficulty, tags, precautions, segments, internalNote });
}

function segmentAt(segments: ExerciseSegment[], t: number): ExerciseSegment | null {
  return segments.find((s) => t >= s.startSec && t < s.endSec) ?? null;
}

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
  const canSpeak = speechSupported();

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

  const dirty = useMemo(() => !!content && !!draft && JSON.stringify(toDraft(content)) !== JSON.stringify(draft), [content, draft]);
  const issues = useMemo(() => (draft && content ? validateExerciseContent({ ...draft, video: content.video }) : []), [draft, content]);
  const editable = !!content && canEditContent(user.role, content.status);
  const canRequestTts = hasPermission(user.role, "tts:request");
  const canSeeAudit = hasPermission(user.role, "audit:read");

  const segments = draft?.segments ?? [];
  const activeSegment = segmentAt(segments, currentTime);

  // 재생 중 구간이 바뀌면 안내문을 읽어 준다 (사용자가 듣게 될 것을 미리 확인)
  useEffect(() => {
    if (!playing || !narrate || !canSpeak) return;
    const key = activeSegment?.id ?? null;
    if (key && key !== lastSpokenRef.current) {
      lastSpokenRef.current = key;
      void speak(activeSegment!.voiceGuide);
    }
  }, [activeSegment, playing, narrate, canSpeak]);

  useEffect(() => {
    if (!playing) {
      stopSpeaking();
      lastSpokenRef.current = null;
    }
  }, [playing]);

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

  const submitBlockedReason = hasBlockingIssues(issues) ? "누락이나 형식 오류를 고친 뒤 검수를 요청할 수 있습니다." : dirty ? "저장하지 않은 변경이 있습니다." : null;
  const hasVideo = !!playback.data;

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
        <div className="mb-4">
          <Alert kind="warning">
            <span className="font-medium">검수 의견:</span> {content.reviewComment}
          </Alert>
        </div>
      )}
      {!editable && hasPermission(user.role, "content:edit") && content.status !== "ARCHIVED" && (
        <div className="mb-4">
          <Alert kind="info">{CONTENT_STATUS_LABELS[content.status]} 상태에서는 내용을 고칠 수 없습니다. 검수한 내용과 공개 내용이 달라지지 않게 하기 위해서입니다.</Alert>
        </div>
      )}
      {actionError && (
        <div className="mb-4">
          <Alert kind="error">{actionError}</Alert>
        </div>
      )}
      {notice && !actionError && (
        <div className="mb-4">
          <Alert kind="success">{notice}</Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <Card
            title="영상과 구간"
            actions={
              canSpeak && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={narrate} onChange={(e) => setNarrate(e.target.checked)} />
                  재생 중 구간 안내 함께 듣기
                </label>
              )
            }
          >
            <VideoPlayer
              ref={playerRef}
              src={playback.data ?? null}
              loadingSrc={playback.loading}
              durationSec={content.video.durationSec}
              segments={segments}
              activeSegmentId={activeSegment?.id ?? null}
              onTimeUpdate={setCurrentTime}
              onPlayStateChange={setPlaying}
              onSegmentClick={(s) => {
                if (hasVideo) {
                  playerRef.current?.seek(s.startSec);
                } else {
                  setCurrentTime(s.startSec);
                }
                document.getElementById(`segment-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }}
            />
            {activeSegment && (
              <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium">
                  지금 구간 {activeSegment.order}. {activeSegment.title}:
                </span>{" "}
                <span className="text-slate-700">{activeSegment.voiceGuide || "(안내문 없음)"}</span>
              </p>
            )}
            {canSpeak && (
              <p className="mt-2 text-xs text-slate-500">미리 듣기는 브라우저 내장 음성을 씁니다. 실제 사용자에게는 생성된 음성 파일이 재생됩니다.</p>
            )}
          </Card>

          <SegmentEditor
            segments={segments}
            durationSec={content.video.durationSec}
            onChange={(next) => setDraft({ ...draft, segments: next })}
            editable={editable}
            dirty={dirty}
            canRequestTts={canRequestTts}
            onRequestTts={(ids) => void onRequestTts(ids)}
            hasVideo={hasVideo}
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

          <Card title="영상 정보">
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="truncate text-right">{children}</dd>
    </div>
  );
}
