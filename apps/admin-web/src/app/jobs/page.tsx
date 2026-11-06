"use client";

import { CONTENT_JOB_KIND_LABELS, DIFFICULTY_LABELS, EXERCISE_CATEGORY_LABELS, hasPermission } from "@yconic/shared-types";
import Link from "next/link";
import { useState } from "react";
import { JobStatusBadge, isJobActive } from "@/components/status-badge";
import { Alert, Button, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useAdmin } from "@/lib/session";
import { useAsync, usePolling } from "@/lib/use-async";
import { formatTimecode } from "@/lib/video";

export default function JobsPage() {
  const { user, api } = useAdmin();
  const jobs = useAsync(() => api.listJobs(), [api]);
  const [error, setError] = useState<string | null>(null);
  const anyActive = (jobs.data ?? []).some((j) => isJobActive(j.status));
  usePolling(anyActive, 2000, jobs.reload);
  const canCreate = hasPermission(user.role, "job:create");

  async function retry(id: string) {
    setError(null);
    try {
      await api.retryJob(id);
      await jobs.reload({ silent: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="AI 제작 작업"
        description="운동 영상을 올리면 AI가 영상을 분석해 동작 구간을 나누고 구간별 음성 안내를 만듭니다. 완료되면 검수할 초안이 생깁니다."
        actions={canCreate && <LinkButton href="/jobs/new" variant="primary">새 AI 제작 요청</LinkButton>}
      />
      {(jobs.error || error) && <Alert kind="error">{jobs.error ?? error}</Alert>}
      {jobs.data && jobs.data.length === 0 && <EmptyState>아직 제작 작업이 없습니다.</EmptyState>}
      <ul className="space-y-3">
        {(jobs.data ?? []).map((j) => (
          <li key={j.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">
                  {j.kind === "REANALYZE" && <span className="mr-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-800">{CONTENT_JOB_KIND_LABELS[j.kind]}</span>}
                  {j.title}
                </h2>
                <p className="text-xs text-slate-500">
                  {EXERCISE_CATEGORY_LABELS[j.category]} · {DIFFICULTY_LABELS[j.difficulty]} · {j.video.fileName} ({formatTimecode(j.video.durationSec)}, {formatBytes(j.video.sizeBytes)}) · 요청 {formatDateTime(j.createdAt)}
                </p>
              </div>
              <JobStatusBadge status={j.status} />
            </div>
            {isJobActive(j.status) && (
              <div className="mt-3 h-2 overflow-hidden rounded bg-slate-100" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${j.title} 진행률`}>
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${j.progress}%` }} />
              </div>
            )}
            {j.requestNote && <p className="mt-2 text-sm text-slate-600">요청 사항: {j.requestNote}</p>}
            {j.status === "FAILED" && (
              <div className="mt-3 space-y-2">
                <Alert kind="error">{j.failureReason ?? "원인을 알 수 없는 오류로 실패했습니다."}</Alert>
                {canCreate && <Button onClick={() => void retry(j.id)}>다시 시도</Button>}
              </div>
            )}
            {j.status === "COMPLETED" && j.contentId && (
              <p className="mt-3 text-sm">
                {j.kind === "REANALYZE" ? "새 분석 결과로 구간을 바꿨습니다." : "초안이 만들어졌습니다."}{" "}
                <Link href={`/contents/${j.contentId}`} className="font-medium text-blue-700 hover:underline">
                  {j.kind === "REANALYZE" ? "콘텐츠 확인하기 →" : "초안 검토하기 →"}
                </Link>
              </p>
            )}
            {j.status !== "COMPLETED" && j.kind === "REANALYZE" && j.contentId && (
              <p className="mt-2 text-sm">
                <Link href={`/contents/${j.contentId}`} className="text-blue-700 hover:underline">
                  대상 콘텐츠 열기 →
                </Link>
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
