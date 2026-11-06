"use client";

import {
  AUDIT_ACTION_LABELS,
  CONTENT_STATUS_LABELS,
  canEditContent,
  hasBlockingIssues,
  hasPermission,
  totalDurationSec,
  validateExerciseContent,
  type ContentAction,
  type ExerciseContent,
} from "@yconic/shared-types";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ContentActions } from "@/components/content-actions";
import { ContentEditor, type ContentDraft } from "@/components/content-editor";
import { ContentStatusBadge } from "@/components/status-badge";
import { Alert, Button, Card, LinkButton, PageHeader } from "@/components/ui";
import { ValidationPanel } from "@/components/validation-panel";
import { errorMessage } from "@/lib/api";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";
import { useAdmin } from "@/lib/session";
import { useAsync, usePolling } from "@/lib/use-async";

function toDraft(c: ExerciseContent): ContentDraft {
  const { title, summary, category, difficulty, tags, precautions, steps, internalNote } = c;
  return structuredClone({ title, summary, category, difficulty, tags, precautions, steps, internalNote });
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

  const dirty = useMemo(() => !!content && !!draft && JSON.stringify(toDraft(content)) !== JSON.stringify(draft), [content, draft]);
  const issues = useMemo(() => (draft ? validateExerciseContent(draft) : []), [draft]);
  const editable = !!content && canEditContent(user.role, content.status);
  const canRequestTts = hasPermission(user.role, "tts:request");
  const canSeeAudit = hasPermission(user.role, "audit:read");

  // 음성 생성 중이면 상태만 조용히 갱신한다. 편집 중인 내용은 유지하고 tts 필드만 반영한다.
  const generating = !!content?.steps.some((s) => s.tts.status === "GENERATING" || s.tts.status === "REQUESTED");
  const pollReload = useCallback(async () => {
    const fresh = await api.getContent(id);
    setContent(fresh);
    setDraft((d) => {
      if (!d) return toDraft(fresh);
      const byId = new Map(fresh.steps.map((s) => [s.id, s.tts]));
      return { ...d, steps: d.steps.map((s) => ({ ...s, tts: byId.get(s.id) ?? s.tts })) };
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

  async function onRequestTts(stepIds: string[]) {
    await run("음성 생성을 요청했습니다. 잠시 뒤 자동으로 갱신됩니다.", () => api.requestTts(id, { stepIds }));
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

  return (
    <>
      <PageHeader
        title={content.title || "(제목 없음)"}
        description={`${content.steps.length}단계 · 약 ${formatDuration(totalDurationSec(content.steps))} · 버전 ${content.version}`}
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
          <Alert kind="info">
            {CONTENT_STATUS_LABELS[content.status]} 상태에서는 내용을 고칠 수 없습니다. 검수한 내용과 공개 내용이 달라지지 않게 하기 위해서입니다.
          </Alert>
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
        <div className="min-w-0">
          <ContentEditor draft={draft} onChange={setDraft} editable={editable} dirty={dirty} canRequestTts={canRequestTts} onRequestTts={(ids) => void onRequestTts(ids)} />
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

          <Card title="정보">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">출처 영상</dt>
                <dd className="truncate text-right" title={content.sourceVideo?.fileName}>
                  {content.sourceVideo ? `${content.sourceVideo.fileName} (${formatBytes(content.sourceVideo.sizeBytes)})` : "없음"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">AI 초안</dt>
                <dd>{content.aiGenerated ? "예" : "아니요"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">만든 날짜</dt>
                <dd>{formatDateTime(content.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">마지막 수정</dt>
                <dd>{formatDateTime(content.updatedAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">공개 날짜</dt>
                <dd>{formatDateTime(content.publishedAt)}</dd>
              </div>
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
