"use client";

import { ADMIN_ROLE_LABELS, AUDIT_ACTION_LABELS, hasPermission } from "@yconic/shared-types";
import Link from "next/link";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useAdmin } from "@/lib/session";
import { useAsync } from "@/lib/use-async";

export default function AuditPage() {
  const { user, api } = useAdmin();
  const allowed = hasPermission(user.role, "audit:read");
  const logs = useAsync(() => (allowed ? api.listAuditLogs() : Promise.resolve([])), [api, allowed]);

  if (!allowed) return <Alert kind="error">감사 로그를 볼 권한이 없습니다.</Alert>;

  return (
    <>
      <PageHeader title="감사 로그" description="누가 언제 무엇을 만들고, 고치고, 승인하고, 공개했는지 기록입니다." />
      {logs.error && <Alert kind="error">{logs.error}</Alert>}
      {logs.data && logs.data.length === 0 && <EmptyState>기록이 없습니다.</EmptyState>}
      {logs.data && logs.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-4 py-2 font-medium">시각</th>
                <th className="px-4 py-2 font-medium">작업</th>
                <th className="px-4 py-2 font-medium">실행자</th>
                <th className="px-4 py-2 font-medium">대상</th>
                <th className="px-4 py-2 font-medium">내용</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.data.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDateTime(l.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2">{AUDIT_ACTION_LABELS[l.action]}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {l.actorName} <span className="text-xs text-slate-500">({ADMIN_ROLE_LABELS[l.actorRole]})</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {l.targetType === "CONTENT" ? (
                      <Link href={`/contents/${l.targetId}`} className="text-blue-700 hover:underline">
                        콘텐츠 {l.targetId}
                      </Link>
                    ) : (
                      <Link href="/jobs" className="text-blue-700 hover:underline">
                        작업 {l.targetId}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2">{l.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
