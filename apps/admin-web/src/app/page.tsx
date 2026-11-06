"use client";

import { CONTENT_STATUSES, CONTENT_STATUS_LABELS, hasPermission, type ContentStatus } from "@yconic/shared-types";
import Link from "next/link";
import { ContentStatusBadge, JobStatusBadge, isJobActive } from "@/components/status-badge";
import { Alert, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import { useAdmin } from "@/lib/session";
import { useAsync, usePolling } from "@/lib/use-async";

export default function DashboardPage() {
  const { user, api } = useAdmin();
  const canSeeJobs = hasPermission(user.role, "job:read");
  const contents = useAsync(() => api.listContents(), [api]);
  const jobs = useAsync(() => (canSeeJobs ? api.listJobs() : Promise.resolve([])), [api, canSeeJobs]);
  const activeJobs = (jobs.data ?? []).filter((j) => isJobActive(j.status));
  usePolling(activeJobs.length > 0, 2000, jobs.reload);

  const counts = Object.fromEntries(CONTENT_STATUSES.map((s) => [s, 0])) as Record<ContentStatus, number>;
  for (const c of contents.data ?? []) counts[c.status] += 1;

  const attention = (contents.data ?? []).filter((c) =>
    hasPermission(user.role, "content:review") ? c.status === "IN_REVIEW" : c.status === "CHANGES_REQUESTED" || c.status === "DRAFT",
  );
  const attentionTitle = hasPermission(user.role, "content:review") ? "검수를 기다리는 콘텐츠" : "작업할 콘텐츠";

  return (
    <>
      <PageHeader
        title={`안녕하세요, ${user.name}님`}
        description="운동 영상을 올리고, AI가 나눈 구간과 음성 안내를 검수해 사용자에게 공개하는 곳입니다."
        actions={hasPermission(user.role, "job:create") && <LinkButton href="/jobs/new" variant="primary">영상 올리고 제작 요청</LinkButton>}
      />

      {contents.error && <Alert kind="error">{contents.error}</Alert>}

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {CONTENT_STATUSES.map((s) => (
          <li key={s}>
            <Link href={`/contents?status=${s}`} className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-blue-400">
              <span className="block text-xs text-slate-500">{CONTENT_STATUS_LABELS[s]}</span>
              <span className="block text-2xl font-bold">{contents.loading ? "–" : counts[s]}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title={attentionTitle}>
          {attention.length === 0 ? (
            <EmptyState>지금은 처리할 콘텐츠가 없습니다.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {attention.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/contents/${c.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {c.title}
                  </Link>
                  <ContentStatusBadge status={c.status} />
                  <span className="shrink-0 text-xs text-slate-500">{formatRelative(c.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canSeeJobs && (
          <Card title="진행 중인 AI 제작 작업" actions={<LinkButton href="/jobs">전체 보기</LinkButton>}>
            {jobs.error && <Alert kind="error">{jobs.error}</Alert>}
            {activeJobs.length === 0 ? (
              <EmptyState>진행 중인 작업이 없습니다.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {activeJobs.map((j) => (
                  <li key={j.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium">{j.title}</span>
                      <JobStatusBadge status={j.status} />
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${j.title} 진행률`}>
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${j.progress}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
