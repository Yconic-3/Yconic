"use client";

import { VISIBILITY_LABELS, visibilityOf, type AdminUser, type ContentAction, type ContentStatus, type ExerciseContent, type Visibility } from "@yconic/shared-types";
import { useEffect, useRef, useState } from "react";
import { planActions } from "@/admin/lib/content-plan";
import { Badge, Button, Textarea } from "./ui";

/**
 * 공개 상태 표시와 공개 상태를 바꾸는 단추들 (docs/decisions/0023).
 * 어떤 단추를 보여 줄지는 lib/content-plan.ts 가 정한다.
 */

const visibilityTone: Record<Visibility, Parameters<typeof Badge>[0]["tone"]> = {
  PUBLIC: "green",
  PRIVATE: "gray",
  REQUESTED: "amber",
  ARCHIVED: "gray",
};

/** 공개 상태 표시. 비공개 안에서 더 알려 줄 것(돌려보냄)은 작은 글씨로 덧붙인다 */
export function VisibilityBadge({ status }: { status: ContentStatus }) {
  const v = visibilityOf(status);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Badge tone={visibilityTone[v]}>
        <span aria-hidden>{v === "PUBLIC" ? "● " : v === "REQUESTED" ? "◐ " : "○ "}</span>
        {VISIBILITY_LABELS[v]}
      </Badge>
      {status === "CHANGES_REQUESTED" && <span className="text-xs text-amber-700">돌려보냄</span>}
    </span>
  );
}

interface ConfirmText {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
}

function confirmText(action: ContentAction, status: ContentStatus): ConfirmText | null {
  switch (action) {
    case "PUBLISH":
    case "PUBLISH_NOW":
      return { title: "공개할까요?", body: "사용자 앱의 운동 목록에 바로 나옵니다. 음성 안내가 없는 구간은 안내 없이 영상만 재생됩니다.", confirm: "공개하기" };
    case "UNPUBLISH":
      return { title: "비공개로 바꿀까요?", body: "사용자 앱의 운동 목록에서 사라집니다. 지금 운동 중인 사용자가 있을 수 있습니다. 내용은 그대로 남아 언제든 다시 공개할 수 있습니다.", confirm: "비공개로" };
    case "REVISE":
      return status === "PUBLISHED"
        ? { title: "비공개로 돌려 고칠까요?", body: "고치는 동안 사용자 앱의 운동 목록에서 사라집니다. 다 고친 뒤 다시 공개해야 합니다.", confirm: "비공개로 돌려 고치기" }
        : { title: "다시 고칠까요?", body: "고친 뒤 다시 공개해야 합니다.", confirm: "고치기" };
    case "REQUEST_CHANGES":
      return { title: "올린 사람에게 돌려보낼까요?", body: "고칠 점을 적어 주세요. 올린 사람에게 전달됩니다.", confirm: "돌려보내기" };
    case "ARCHIVE":
      return { title: "보관할까요?", body: "목록의 '보관' 탭으로 옮겨집니다. 보관 해제 전까지 고치거나 공개할 수 없습니다.", confirm: "보관하기", danger: true };
    default:
      return null;
  }
}

/** 확인이 필요한 행동을 묻는 창. Esc나 바깥을 누르면 닫힌다 */
export function ConfirmAction({
  action,
  status,
  busy,
  note,
  onConfirm,
  onCancel,
}: {
  action: ContentAction;
  status: ContentStatus;
  busy: boolean;
  /** 본문 아래에 덧붙이는 말 (예: 확인이 필요한 것 3개) */
  note?: string | null;
  onConfirm(comment?: string): void;
  onCancel(): void;
}) {
  const text = confirmText(action, status);
  const [comment, setComment] = useState("");
  const needsComment = action === "REQUEST_CHANGES";
  const confirmRef = useRef<HTMLButtonElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (needsComment ? commentRef.current : confirmRef.current)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [needsComment, onCancel]);

  if (!text) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-action-title" className="w-full max-w-md rounded-2xl border-2 border-slate-300 bg-white p-5 text-left" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-action-title" className="text-xl font-extrabold">
          {text.title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{text.body}</p>
        {note && <p className="mt-2 rounded-xl border-2 border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{note}</p>}
        {needsComment && (
          <label className="mt-3 block">
            <span className="sr-only">고칠 점</span>
            <Textarea ref={commentRef} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="예: 2구간 안내에 무릎 각도 설명을 넣어 주세요." />
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button ref={confirmRef} variant={text.danger ? "danger" : "primary"} disabled={busy || (needsComment && !comment.trim())} onClick={() => onConfirm(needsComment ? comment.trim() : undefined)}>
            {busy ? "처리 중…" : text.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 확인 창이 필요한 행동인지 */
export function needsConfirm(action: ContentAction): boolean {
  return confirmText(action, "DRAFT") !== null;
}

/**
 * 공개 상태 단추 묶음. 확인이 필요한 행동은 창을 띄워 묻는다.
 * compact면 목록의 한 줄에 맞게 가장 알맞은 단추 하나만 보여 준다.
 */
export function VisibilityActions({
  user,
  content,
  publishBlocked = null,
  confirmNote = null,
  busy,
  compact = false,
  onAction,
}: {
  user: AdminUser;
  content: Pick<ExerciseContent, "status" | "createdBy" | "submittedBy">;
  publishBlocked?: string | null;
  confirmNote?: string | null;
  busy: boolean;
  compact?: boolean;
  onAction(action: ContentAction, comment?: string): Promise<void>;
}) {
  const [pending, setPending] = useState<ContentAction | null>(null);
  const planned = planActions(user, content, publishBlocked);
  const shown = compact ? planned.slice(0, 1) : planned;
  if (shown.length === 0) return null;
  const blockedText = shown.find((p) => p.blocked)?.blocked ?? null;
  const hint = shown.find((p) => p.hint && !p.blocked)?.hint ?? null;

  async function run(action: ContentAction, comment?: string) {
    await onAction(action, comment);
    setPending(null);
  }

  return (
    <div className={compact ? "" : "flex flex-col items-end gap-1"}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {shown.map((p) => (
          <Button
            key={p.action}
            variant={p.variant}
            className={compact ? "whitespace-nowrap px-3 py-1.5" : "whitespace-nowrap"}
            disabled={busy || !!p.blocked}
            title={p.blocked ?? p.hint}
            onClick={() => (needsConfirm(p.action) ? setPending(p.action) : void run(p.action))}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {!compact && blockedText && <p className="max-w-xs text-right text-xs text-amber-700">{blockedText}</p>}
      {!compact && !blockedText && hint && <p className="max-w-xs text-right text-xs text-slate-500">{hint}</p>}
      {pending && (
        <ConfirmAction
          action={pending}
          status={content.status}
          busy={busy}
          note={pending === "PUBLISH" || pending === "PUBLISH_NOW" ? confirmNote : null}
          onConfirm={(comment) => void run(pending, comment)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
