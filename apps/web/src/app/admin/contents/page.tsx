"use client";

import {
  CONTENT_JOB_STATUS_LABELS,
  DIFFICULTY_LABELS,
  EXERCISE_CATEGORY_LABELS,
  VISIBILITY_LABELS,
  hasBlockingIssues,
  hasPermission,
  validateExerciseContent,
  visibilityOf,
  type ContentAction,
  type ContentJob,
  type ExerciseContent,
  type VideoAsset,
  type Visibility,
} from "@yconic/shared-types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { VisibilityActions, VisibilityBadge } from "@/admin/components/content-actions";
import { isJobActive } from "@/admin/components/status-badge";
import { Alert, Button, EmptyState, Input, LinkButton } from "@/admin/components/ui";
import { errorMessage } from "@/admin/lib/api";
import { actionDoneMessage } from "@/admin/lib/content-plan";
import { formatRelative } from "@/admin/lib/format";
import { useAdmin } from "@/admin/lib/session";
import { useAsync, usePolling } from "@/admin/lib/use-async";
import { formatTimecode } from "@/admin/lib/video";

export default function ContentsPage() {
  return (
    <Suspense fallback={null}>
      <ContentsList />
    </Suspense>
  );
}

type Tab = "all" | Visibility;
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "PUBLIC", label: VISIBILITY_LABELS.PUBLIC },
  { key: "PRIVATE", label: VISIBILITY_LABELS.PRIVATE },
  { key: "REQUESTED", label: VISIBILITY_LABELS.REQUESTED },
  { key: "ARCHIVED", label: VISIBILITY_LABELS.ARCHIVED },
];
const TAB_PARAM: Record<Tab, string> = { all: "", PUBLIC: "public", PRIVATE: "private", REQUESTED: "requested", ARCHIVED: "archived" };

/** 실패한 분석은 며칠 동안만 목록 위에 보여 준다 (그 뒤에는 분석 내역에서 본다) */
const FAILED_JOB_SHOWN_MS = 3 * 24 * 60 * 60 * 1000;

function ContentsList() {
  const { user, api } = useAdmin();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (Object.keys(TAB_PARAM) as Tab[]).find((t) => TAB_PARAM[t] === (params.get("show") ?? "")) ?? "all";
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(query);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const list = useAsync(() => api.listContents({ query: debounced }), [api, debounced]);
  const canSeeJobs = hasPermission(user.role, "job:read");
  const canUpload = hasPermission(user.role, "job:create");
  const jobs = useAsync(() => (canSeeJobs ? api.listJobs() : Promise.resolve([] as ContentJob[])), [api, canSeeJobs]);

  const activeJobs = useMemo(() => (jobs.data ?? []).filter((j) => isJobActive(j.status)), [jobs.data]);
  const failedJobs = useMemo(() => (jobs.data ?? []).filter((j) => j.status === "FAILED" && Date.now() - new Date(j.updatedAt).getTime() < FAILED_JOB_SHOWN_MS), [jobs.data]);
  usePolling(activeJobs.length > 0, 2000, jobs.reload);
  // 분석이 끝나면 새 초안이 목록에 나오게 다시 불러온다
  const activeCountRef = useRef(0);
  const reloadList = list.reload;
  useEffect(() => {
    if (activeJobs.length < activeCountRef.current) void reloadList({ silent: true });
    activeCountRef.current = activeJobs.length;
  }, [activeJobs.length, reloadList]);
  const reanalyzingIds = useMemo(() => new Set(activeJobs.filter((j) => j.kind === "REANALYZE" && j.contentId).map((j) => j.contentId!)), [activeJobs]);

  const all = list.data ?? [];
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, PUBLIC: 0, PRIVATE: 0, REQUESTED: 0, ARCHIVED: 0 };
    for (const x of all) {
      const v = visibilityOf(x.status);
      c[v] += 1;
      if (v !== "ARCHIVED") c.all += 1;
    }
    return c;
  }, [all]);
  const shown = all.filter((c) => (tab === "all" ? visibilityOf(c.status) !== "ARCHIVED" : visibilityOf(c.status) === tab));

  function setTab(next: Tab) {
    const p = new URLSearchParams(params.toString());
    if (TAB_PARAM[next]) p.set("show", TAB_PARAM[next]);
    else p.delete("show");
    router.replace(`/admin/contents${p.toString() ? `?${p.toString()}` : ""}`);
  }

  async function act(c: ExerciseContent, action: ContentAction, comment?: string) {
    setBusyId(c.id);
    setError(null);
    setNotice(null);
    try {
      const next = await api.changeContentStatus(c.id, { action, comment });
      await list.reload({ silent: true });
      setNotice(`${next.title || "(제목 없음)"}: ${actionDoneMessage(action, next.status)}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function retry(id: string) {
    setError(null);
    try {
      await api.retryJob(id);
      await jobs.reload({ silent: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const nothingYet = !!list.data && all.length === 0 && !debounced && activeJobs.length === 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-extrabold leading-tight">콘텐츠</h1>
        <label className="w-full sm:w-72">
          <span className="sr-only">검색</span>
          <Input type="search" placeholder="제목이나 태그로 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      {(list.error || jobs.error || error) && (
        <div className="mb-3">
          <Alert kind="error">{error ?? list.error ?? jobs.error}</Alert>
        </div>
      )}
      {notice && !error && (
        <div className="mb-3">
          <Alert kind="success">{notice}</Alert>
        </div>
      )}

      {(activeJobs.length > 0 || failedJobs.length > 0) && (
        <section aria-label="분석 중인 영상" className="mb-4 rounded-2xl border-2 border-slate-200 bg-white">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
            <h2 className="text-sm font-extrabold">{activeJobs.length > 0 ? "올린 영상을 AI가 분석하고 있습니다" : "분석하지 못한 영상이 있습니다"}</h2>
            <Link href="/admin/jobs" className="text-xs text-slate-500 hover:text-blue-700 hover:underline">
              분석 내역
            </Link>
          </header>
          <ul className="divide-y divide-slate-200">
            {[...activeJobs, ...failedJobs].map((j) => (
              <li key={j.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-bold">
                    {j.title}
                    {j.kind === "REANALYZE" && <span className="ml-2 text-xs font-normal text-slate-500">다시 분석</span>}
                  </span>
                  {j.status === "FAILED" ? (
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-bold text-red-700">분석 실패</span>
                      {canUpload && (
                        <Button className="px-2.5 py-1 text-xs" onClick={() => void retry(j.id)}>
                          다시 시도
                        </Button>
                      )}
                    </span>
                  ) : (
                    <span className="text-sm text-slate-600">
                      {CONTENT_JOB_STATUS_LABELS[j.status]} · {j.progress}%
                    </span>
                  )}
                </div>
                {j.status === "FAILED" ? (
                  <p className="mt-1 text-xs text-red-700">{j.failureReason ?? "원인을 알 수 없는 오류로 실패했습니다."}</p>
                ) : (
                  <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${j.title} 분석 진행률`}>
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${j.progress}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {nothingYet ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 px-4 py-12 text-center">
          <p className="text-lg font-extrabold">아직 올린 영상이 없습니다</p>
          <p className="mt-1 text-sm text-slate-500">운동 영상을 올리면 AI가 구간을 나누고 구간마다 음성 안내를 써 줍니다.</p>
          {canUpload && (
            <div className="mt-4">
              <LinkButton href="/admin/jobs/new" variant="primary">
                <span aria-hidden>＋</span> 영상 올리기
              </LinkButton>
            </div>
          )}
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="공개 상태로 보기" className="mb-3 flex flex-wrap gap-1 border-b-2 border-slate-200">
            {TABS.filter((t) => t.key !== "ARCHIVED" || counts.ARCHIVED > 0 || tab === "ARCHIVED").map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={`-mb-0.5 border-b-[3px] px-3 py-2 text-[15px] ${active ? "border-blue-600 font-extrabold text-blue-700" : "border-transparent font-bold text-slate-500 hover:text-slate-800"}`}
                >
                  {t.label} <span className={active ? "" : "text-slate-400"}>{list.data ? counts[t.key] : ""}</span>
                </button>
              );
            })}
          </div>

          {list.data && shown.length === 0 && <EmptyState>{debounced ? "찾는 영상이 없습니다." : "여기에는 아직 영상이 없습니다."}</EmptyState>}
          {shown.length > 0 && (
            <ul className="divide-y divide-slate-200 rounded-2xl border-2 border-slate-200 bg-white">
              {shown.map((c) => {
                const issues = validateExerciseContent(c);
                const blocking = hasBlockingIssues(issues);
                const errorCount = issues.filter((i) => i.severity === "ERROR").length;
                const publishBlocked = reanalyzingIds.has(c.id) ? "다시 분석이 끝난 뒤 공개할 수 있습니다." : blocking ? `고쳐야 할 것이 ${errorCount}개 있습니다. 열어서 고쳐 주세요.` : null;
                const href = `/admin/contents/${c.id}`;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 hover:bg-slate-50">
                    <Link href={href} className="block w-36 flex-none sm:w-40" tabIndex={-1} aria-hidden>
                      <VideoThumb video={c.video} />
                    </Link>
                    <div className="min-w-0 flex-1 basis-56">
                      <Link href={href} className="block truncate text-[17px] font-extrabold hover:underline">
                        {c.title || "(제목 없음)"}
                      </Link>
                      <p className="truncate text-sm text-slate-500">{c.summary || "요약이 없습니다."}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {EXERCISE_CATEGORY_LABELS[c.category]} · {DIFFICULTY_LABELS[c.difficulty]} · 구간 {c.segments.length}개 · <span title={c.updatedAt}>{formatRelative(c.updatedAt)} 고침</span>
                      </p>
                      {blocking && visibilityOf(c.status) !== "ARCHIVED" && <p className="mt-0.5 text-xs font-bold text-amber-700">고쳐야 할 것 {errorCount}개</p>}
                      {c.status === "CHANGES_REQUESTED" && c.reviewComment && <p className="mt-0.5 truncate text-xs text-amber-700">돌려보낸 까닭: {c.reviewComment}</p>}
                    </div>
                    <div className="flex flex-none items-center gap-3">
                      <VisibilityBadge status={c.status} />
                      <div className="w-[104px] text-right">
                        <VisibilityActions user={user} content={c} publishBlocked={publishBlocked} busy={busyId === c.id} compact onAction={(a, comment) => act(c, a, comment)} />
                      </div>
                      <LinkButton href={href} className="whitespace-nowrap px-3 py-1.5">
                        열기
                      </LinkButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/** 영상의 한 장면과 길이. 파일이 없는 예시 영상은 빈 칸으로 보여 준다 */
function VideoThumb({ video }: { video: VideoAsset }) {
  return (
    <span className="relative block aspect-video overflow-hidden rounded-xl bg-black">
      {video.url ? (
        <video src={`${video.url}#t=1`} preload="metadata" muted playsInline tabIndex={-1} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-2xl text-slate-500" aria-hidden>
          ▶
        </span>
      )}
      <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink">{formatTimecode(video.durationSec)}</span>
    </span>
  );
}
