"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { courseLabel } from "@yconic/shared-types";
import { safeNextPath, signOut } from "@/lib/auth";
import { accountLabel, LoginForm } from "@/user/components/login-form";
import { Button, ICONS, Section } from "@/user/components/ui";
import { usePage, useShell } from "@/user/lib/shell";

/**
 * 내 계정 (/account). 로그인 전이면 로그인 양식, 로그인했으면 계정 정보와 로그아웃.
 * 로그인이 필요한 화면에서 넘어오면 ?next=로 원래 가려던 곳을 기억했다가 로그인 뒤에 보낸다.
 */
export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <Account />
    </Suspense>
  );
}

function Account() {
  const { account, refreshAccount, say, learnedCourses } = useShell();
  const router = useRouter();
  const next = useSearchParams().get("next");
  usePage({ mode: "consume", title: account ? "내 계정" : "로그인", chips: account ? ["로그아웃", "운동하기"] : ["운동하기", "도움말"] });

  if (!account) {
    return (
      <>
        <LoginForm
          idPrefix="account"
          onSignedIn={(a) => {
            refreshAccount();
            void say(`${a.name}님으로 로그인했습니다. 이제 내 강의에 맞춘 안내와 콘텐츠 올리기를 쓸 수 있습니다.`);
            if (next) router.replace(safeNextPath(next));
          }}
        />
        <Section id="account-benefits-title" title="로그인하면 달라지는 것">
          <ul className="m-0 flex flex-col gap-2 pl-[22px] text-[18px] text-ink-2">
            <li>
              <span className="font-bold text-ink">내 강의.</span> 강사에게 배운 강의를 등록하면 그 동작은 배운 용어로 짧게 안내합니다.
            </li>
            <li>
              <span className="font-bold text-ink">콘텐츠 올리기.</span> 운동 영상을 올리고 음성 안내 초안을 만들어 검수를 요청합니다.
            </li>
            <li>
              <span className="font-bold text-ink">내 콘텐츠.</span> 올린 콘텐츠의 공개·검수 상태를 확인합니다.
            </li>
          </ul>
          <p className="m-0 text-[17px] text-ink-3">로그인하지 않아도 운동 찾기와 안내 듣기는 쓸 수 있습니다. 이때는 모든 동작을 자세하게 안내합니다.</p>
        </Section>
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
      </ul>
      <Button
        size="lg"
        icon={ICONS.logout}
        onClick={() => {
          signOut();
          refreshAccount();
          void say("로그아웃했습니다. 운동 찾기와 안내 듣기는 계속 쓸 수 있습니다.");
        }}
        className="!min-h-[72px]"
      >
        로그아웃
      </Button>
    </Section>
  );
}
