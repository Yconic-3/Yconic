"use client";

import { CONTENT_TRANSITIONS, availableActions, type AdminRole, type ContentAction, type ContentStatus } from "@yconic/shared-types";
import { useState } from "react";
import { Button, Textarea } from "./ui";

interface Props {
  role: AdminRole;
  status: ContentStatus;
  /** 행동별로 막아야 하는 이유. 값이 있으면 버튼을 잠그고 이유를 보여 준다 */
  blockedReasons: Partial<Record<ContentAction, string | null>>;
  busy: boolean;
  onAction(action: ContentAction, comment?: string): Promise<void>;
}

const variantFor: Partial<Record<ContentAction, "primary" | "danger">> = {
  SUBMIT_FOR_REVIEW: "primary",
  APPROVE: "primary",
  PUBLISH: "primary",
  ARCHIVE: "danger",
};

const CONFIRM_MESSAGES: Partial<Record<ContentAction, string>> = {
  APPROVE: "검수 내용을 확인했고 이 콘텐츠를 승인합니다. 승인 후에는 내용을 고칠 수 없습니다.",
  PUBLISH: "사용자 앱과 사용자 AI에 바로 공개됩니다. 음성 안내가 없는 구간은 안내 없이 영상만 재생됩니다.",
  UNPUBLISH: "사용자에게 더 이상 보이지 않게 됩니다. 운동 중인 사용자가 있을 수 있습니다.",
  ARCHIVE: "보관하면 목록에서 보관됨으로 표시되고, 보관 해제 전까지 사용할 수 없습니다.",
};

export function ContentActions({ role, status, blockedReasons, busy, onAction }: Props) {
  const actions = availableActions(role, status);
  const [pending, setPending] = useState<ContentAction | null>(null);
  const [comment, setComment] = useState("");

  if (actions.length === 0) return <p className="text-sm text-slate-500">이 상태에서 할 수 있는 작업이 없습니다.</p>;

  const pendingTransition = pending ? CONTENT_TRANSITIONS[pending] : null;
  const needsComment = pending === "REQUEST_CHANGES";

  async function confirm() {
    if (!pending) return;
    await onAction(pending, needsComment ? comment.trim() : undefined);
    setPending(null);
    setComment("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const t = CONTENT_TRANSITIONS[a];
          const blocked = blockedReasons[a] ?? null;
          return (
            <Button
              key={a}
              variant={variantFor[a] ?? "secondary"}
              disabled={busy || !!blocked || pending !== null}
              title={blocked ?? undefined}
              onClick={() => {
                if (t.needsConfirm || a === "REQUEST_CHANGES") setPending(a);
                else void onAction(a);
              }}
            >
              {t.label}
            </Button>
          );
        })}
      </div>
      {actions
        .filter((a) => blockedReasons[a])
        .map((a) => (
          <p key={a} className="text-xs text-amber-700">
            {CONTENT_TRANSITIONS[a].label}: {blockedReasons[a]}
          </p>
        ))}

      {pending && pendingTransition && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3" role="group" aria-label={`${pendingTransition.label} 확인`}>
          <p className="text-sm font-medium">{pendingTransition.label}하시겠습니까?</p>
          {CONFIRM_MESSAGES[pending] && <p className="mt-1 text-xs text-amber-900">{CONFIRM_MESSAGES[pending]}</p>}
          {needsComment && (
            <label className="mt-2 block">
              <span className="text-sm font-medium">검수 의견 (편집자에게 전달됩니다)</span>
              <Textarea className="mt-1" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="예: 2단계 안내문에 무릎 각도 설명을 추가해 주세요." />
            </label>
          )}
          <div className="mt-2 flex gap-2">
            <Button variant={variantFor[pending] ?? "primary"} disabled={busy || (needsComment && !comment.trim())} onClick={() => void confirm()}>
              {needsComment ? "수정 요청 보내기" : `${pendingTransition.label} 확인`}
            </Button>
            <Button onClick={() => setPending(null)} disabled={busy}>
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
