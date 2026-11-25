"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { courseLabel } from "@yconic/shared-types";
import { safeNextPath, signOut } from "@/lib/auth";
import { accountLabel, LoginForm } from "@/user/components/login-form";
import { Button, ICONS, Section } from "@/user/components/ui";
import { createCreatorApi } from "@/user/lib/creator-api";
import { usePage, useShell } from "@/user/lib/shell";

/**
 * 내 계정 (/account, 시안 D 네온 그린 · 08 로그인 기능 접근 시, 11 내 계정).
 * - 로그인 전: 저장된 계정으로 로그인. 로그인이 필요한 화면에서 넘어오면(?next=) 이유를 알리고, 로그인 뒤 그 화면으로 보낸다
 * - 로그인 후: 계정 정보(계정, 내 강의, 올린 콘텐츠)와 로그아웃
 */
export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <Account />
    </Suspense>
  );
}

/** 로그인이 필요한 화면에서 넘어왔을 때 알릴 이유 */
function reasonFor(next: string | null): string | null {
  if (!next) return null;
  if (next.startsWith("/my")) return "콘텐츠 올리기는 로그인 후 쓸 수 있습니다.";
  if (next.startsWith("/courses")) return "내 강의는 로그인 후 쓸 수 있습니다.";
  return "이 기능은 로그인 후 쓸 수 있습니다.";
}

function Account() {
  const { account, refreshAccount, say, learnedCourses } = useShell();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const reason = reasonFor(next);
  usePage({ mode: next?.startsWith("/my") ? "supply" : "consume", title: account ? "내 계정" : "저장된 계정으로 로그인", chips: account ? ["로그아웃", "운동하기"] : ["로그인", "운동하기"] });

  // 올린 콘텐츠 수 (로그인했을 때만)
  const [uploads, setUploads] = useState<number | null>(null);
  useEffect(() => {
    if (!account) {
      setUploads(null);
      return;
    }
    let cancelled = false;
    createCreatorApi()
      .listMyContents()
      .then((list) => !cancelled && setUploads(list.length))
      .catch(() => !cancelled && setUploads(null));
    return () => {
      cancelled = true;
    };
  }, [account]);

  if (!account) {
    return (
      <>
        {reason && <p className="m-0 text-[20px] font-bold">{reason}</p>}
        <LoginForm
          idPrefix="account"
          onSignedIn={(a) => {
            refreshAccount();
            void say(`${a.name}님으로 로그인했습니다.`);
            if (next) router.replace(safeNextPath(next));
          }}
        />
        <p className="m-0 text-[17px] text-ink-3">로그인하지 않아도 운동 고르기와 안내 듣기는 쓸 수 있습니다. 이때는 모든 동작을 자세하게 안내합니다.</p>
      </>
    );
  }

  return (
    <Section id="account-title" title={`${account.name}님으로 로그인되어 있습니다`}>
      <ul className="m-0 flex list-none flex-col gap-2 rounded-2xl border-2 border-control bg-panel px-5 py-[18px] text-[19px]">
        <li>
          <span className="font-bold">계정.</span> <span className="text-ink-2">{account.email}</span>
        </li>
        <li>
          <span className="font-bold">구분.</span> <span className="text-ink-2">{accountLabel(account)}</span>
        </li>
        <li>
          <span className="font-bold">내 강의.</span>{" "}
          <span className="text-ink-2">{learnedCourses?.length ? learnedCourses.map(courseLabel).join(", ") : "등록 없음 (모든 동작을 자세히 안내)"}</span>
        </li>
        <li>
          <span className="font-bold">올린 콘텐츠.</span> <span className="text-ink-2">{uploads === null ? "확인하는 중" : `${uploads}개`}</span>
        </li>
      </ul>
      <Button
        size="lg"
        icon={ICONS.logout}
        onClick={() => {
          signOut();
          refreshAccount();
          void say("로그아웃했습니다. 운동 고르기와 안내 듣기는 계속 쓸 수 있습니다.");
        }}
        className="!min-h-[72px]"
      >
        로그아웃
      </Button>
      <p className="m-0 text-[17px] text-ink-3">시연용 체험 계정입니다. 로그아웃해도 간편 로그인 정보는 남아 있어 다시 버튼만 누르면 로그인됩니다.</p>
    </Section>
  );
}
