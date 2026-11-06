"use client";

import { CONTENT_STATUSES, CONTENT_STATUS_LABELS, DIFFICULTY_LABELS, EXERCISE_CATEGORY_LABELS, type ContentStatus } from "@yconic/shared-types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ContentStatusBadge } from "@/components/status-badge";
import { Alert, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import { useAdmin } from "@/lib/session";
import { useAsync } from "@/lib/use-async";
import { formatTimecode } from "@/lib/video";

export default function ContentsPage() {
  return (
    <Suspense fallback={null}>
      <ContentsList />
    </Suspense>
  );
}

function ContentsList() {
  const { api } = useAdmin();
  const router = useRouter();
  const params = useSearchParams();
  const statusParam = params.get("status");
  const status = CONTENT_STATUSES.includes(statusParam as ContentStatus) ? (statusParam as ContentStatus) : undefined;
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const list = useAsync(() => api.listContents({ status, query: debounced }), [api, status, debounced]);

  function setStatus(next: string) {
    const p = new URLSearchParams(params.toString());
    if (next) p.set("status", next);
    else p.delete("status");
    router.replace(`/contents?${p.toString()}`);
  }

  return (
    <>
      <PageHeader title="운동 영상" description="올린 영상과 영상 위에 붙인 구간별 음성 안내를 검수하고 공개합니다." />

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="flex-1">
          <span className="sr-only">검색</span>
          <Input type="search" placeholder="제목, 요약, 태그, 파일 이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="w-44">
          <span className="sr-only">상태 필터</span>
          <Select value={status ?? ""} onChange={(e) => setStatus(e.target.value)}>
            <option value="">모든 상태</option>
            {CONTENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONTENT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {list.error && <Alert kind="error">{list.error}</Alert>}
      {list.data && list.data.length === 0 && <EmptyState>조건에 맞는 영상이 없습니다.</EmptyState>}
      {list.data && list.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-4 py-2 font-medium">제목</th>
                <th className="px-4 py-2 font-medium">영상</th>
                <th className="px-4 py-2 font-medium">분류</th>
                <th className="px-4 py-2 font-medium">난이도</th>
                <th className="px-4 py-2 font-medium">구간</th>
                <th className="px-4 py-2 font-medium">상태</th>
                <th className="px-4 py-2 font-medium">수정</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/contents/${c.id}`} className="font-medium hover:underline">
                      {c.title}
                    </Link>
                    {c.aiGenerated && <span className="ml-2 text-xs text-slate-400">AI 초안</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    <span className="block max-w-48 truncate" title={c.video.fileName}>
                      {c.video.fileName}
                    </span>
                    <span className="font-mono text-xs">{formatTimecode(c.video.durationSec)}</span>
                  </td>
                  <td className="px-4 py-2">{EXERCISE_CATEGORY_LABELS[c.category]}</td>
                  <td className="px-4 py-2">{DIFFICULTY_LABELS[c.difficulty]}</td>
                  <td className="px-4 py-2 text-slate-600">{c.segments.length}개</td>
                  <td className="px-4 py-2">
                    <ContentStatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-2 text-slate-500" title={c.updatedAt}>
                    {formatRelative(c.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
