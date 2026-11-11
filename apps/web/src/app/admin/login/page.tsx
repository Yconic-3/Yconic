"use client";

import { ADMIN_ROLE_LABELS, ROLE_PERMISSIONS, type AdminRole } from "@yconic/shared-types";
import { Alert } from "@/admin/components/ui";
import { useSession } from "@/admin/lib/session";

const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  VIEWER: "콘텐츠와 작업 상태를 볼 수만 있습니다.",
  EDITOR: "영상으로 제작 요청을 만들고, AI 초안을 고쳐 검수를 요청합니다.",
  APPROVER: "편집자 권한에 더해 검수·승인하고 사용자에게 공개합니다.",
  SUPER_ADMIN: "모든 권한과 감사 로그 조회 권한을 가집니다.",
};

export default function LoginPage() {
  const { users, login, mode } = useSession();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold">Yconic 관리자</h1>
      <p className="mt-1 text-sm text-slate-600">시각장애인 AI 운동 지원 플랫폼 콘텐츠 관리</p>

      {mode === "http" ? (
        <div className="mt-8">
          <Alert kind="info">백엔드 인증 방식이 아직 정해지지 않았습니다. 백엔드가 준비되면 이 화면이 실제 로그인으로 바뀝니다.</Alert>
        </div>
      ) : (
        <>
          <div className="mt-8">
            <Alert kind="warning">모의 데이터 모드입니다. 역할을 골라 로그인하면 권한에 따라 화면과 가능한 작업이 달라집니다.</Alert>
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => login(u.id)}
                  className="h-full w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-400 hover:shadow"
                >
                  <span className="block text-base font-semibold">{u.name}</span>
                  <span className="block text-sm text-blue-700">{ADMIN_ROLE_LABELS[u.role]}</span>
                  <span className="mt-2 block text-xs text-slate-600">{ROLE_DESCRIPTIONS[u.role]}</span>
                  <span className="mt-2 block text-xs text-slate-400">권한 {ROLE_PERMISSIONS[u.role].length}개</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
