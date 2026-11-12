"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { MyContent } from "@yconic/shared-types";
import { creatorStatusLine, LoginRequired } from "@/user/components/creator-ui";
import { Button, ICONS, ListButton, Section } from "@/user/components/ui";
import { createCreatorApi, creatorErrorMessage } from "@/user/lib/creator-api";
import { usePage, useShell } from "@/user/lib/shell";

/** 내 콘텐츠 (/my/contents): 내가 올린 콘텐츠와 검수·공개 상태 */
export default function MyContentsPage() {
  const { account, say } = useShell();
  const router = useRouter();
  const api = useMemo(() => createCreatorApi(), []);
  const [contents, setContents] = useState<MyContent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  usePage({ mode: "supply", title: "내 콘텐츠", chips: ["새 콘텐츠", "운동하기"] });

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    api
      .listMyContents()
      .then((list) => !cancelled && setContents(list))
      .catch((e) => !cancelled && setError(creatorErrorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [account, api]);

  if (!account) return <LoginRequired />;

  return (
    <Section id="mine-title" title="내가 올린 콘텐츠">
      <Button tone="primary" size="xl" icon={ICONS.plus} onClick={() => router.push("/my/contents/new")}>
        새 콘텐츠 만들기
      </Button>
      {error ? (
        <p role="alert" className="m-0 text-ink-2">
          목록을 불러오지 못했어요. {error}
        </p>
      ) : contents === null ? (
        <p className="m-0 text-ink-2">목록을 불러오는 중이에요.</p>
      ) : contents.length === 0 ? (
        <p className="m-0 text-ink-2">아직 올린 콘텐츠가 없어요. 새 콘텐츠 만들기로 운동 영상을 올려 보세요.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {contents.map((c) => (
            <li key={c.id}>
              <ListButton
                icon={ICONS.video}
                title={c.title}
                sub={creatorStatusLine(c)}
                onClick={() => {
                  void say(`${c.title}. ${creatorStatusLine(c)}`);
                  router.push(`/my/contents/${encodeURIComponent(c.id)}`);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
