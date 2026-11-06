"use client";

import type { ContentJob, ExerciseContent } from "@yconic/shared-types";
import { useRef, useState } from "react";
import { errorMessage, type AdminApi } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { formatTimecode, readVideoMetadata, type VideoMetadata } from "@/lib/video";
import { Button, Textarea } from "./ui";

interface CommonProps {
  api: AdminApi;
  content: ExerciseContent;
  /** 저장하지 않은 변경이 있거나 다른 작업 중이면 잠근다 */
  lockedReason: string | null;
  onError(message: string): void;
}

/** 콘텐츠의 영상을 새 파일로 바꾼다. 구간은 그대로 두고, 길이가 다르면 검사 결과가 알려 준다. */
export function ReplaceVideoPanel({ api, content, lockedReason, onError, onReplaced }: CommonProps & { onReplaced(next: ExerciseContent): void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<VideoMetadata | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(f: File | null) {
    setFile(null);
    setMeta(null);
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      onError("영상 파일만 올릴 수 있습니다.");
      return;
    }
    try {
      setMeta(await readVideoMetadata(f));
      setFile(f);
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  function cancel() {
    setFile(null);
    setMeta(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirm() {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    let uploadedId: string | null = null;
    try {
      const video = await api.uploadVideo(file, setProgress);
      uploadedId = video.id;
      const next = await api.replaceContentVideo(content.id, { videoId: video.id, expectedVersion: content.version });
      uploadedId = null;
      onReplaced(next);
      cancel();
    } catch (e) {
      onError(errorMessage(e));
      // 영상만 올라가고 교체가 실패하면 연결되지 않은 영상이 남지 않게 지운다.
      if (uploadedId) await api.deleteVideo(uploadedId).catch(() => undefined);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const durationDiff = meta ? Math.abs(meta.durationSec - content.video.durationSec) : 0;

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept="video/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
      {!file && (
        <Button className="w-full" onClick={() => inputRef.current?.click()} disabled={!!lockedReason || busy} title={lockedReason ?? undefined}>
          영상 교체
        </Button>
      )}
      {file && meta && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm" role="group" aria-label="영상 교체 확인">
          <p className="font-medium">이 영상으로 바꿀까요?</p>
          <p className="mt-1 break-all text-xs text-slate-700">
            {file.name} · {formatTimecode(meta.durationSec)} · {meta.width}×{meta.height} · {formatBytes(file.size)}
          </p>
          <p className="mt-1 text-xs text-amber-900">
            지금 구간과 안내문은 그대로 남습니다.
            {durationDiff > 1 ? ` 길이가 ${Math.round(durationDiff)}초 달라 구간이 맞지 않을 수 있으니, 바꾼 뒤 "다시 분석"을 권장합니다.` : ""}
          </p>
          {progress !== null && (
            <div className="mt-2 h-2 overflow-hidden rounded bg-amber-100" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="영상 올리는 중">
              <div className="h-full bg-amber-500 transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Button variant="primary" onClick={() => void confirm()} disabled={busy}>
              {busy ? "바꾸는 중…" : "교체"}
            </Button>
            <Button onClick={cancel} disabled={busy}>
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 현재 영상을 다시 분석한다. 끝나면 구간과 안내문이 새 결과로 바뀐다. */
export function ReanalyzePanel({ api, content, lockedReason, onError, onStarted }: CommonProps & { onStarted(job: ContentJob): void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const job = await api.reanalyzeContent(content.id, { requestNote: note, expectedVersion: content.version });
      setOpen(false);
      setNote("");
      onStarted(job);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button className="w-full" onClick={() => setOpen(true)} disabled={!!lockedReason} title={lockedReason ?? undefined}>
        다시 분석
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm" role="group" aria-label="다시 분석 확인">
      <p className="font-medium">영상을 다시 분석할까요?</p>
      <p className="mt-1 text-xs text-amber-900">끝나면 지금 구간과 안내문이 모두 새 결과로 바뀝니다. 제목·요약·주의사항은 그대로입니다. 분석하는 동안은 수정과 검수 요청이 잠깁니다.</p>
      <label className="mt-2 block">
        <span className="text-xs font-medium">AI에게 전달할 요청 사항 (선택)</span>
        <Textarea className="mt-1 min-h-16" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 휴식 구간을 넉넉히 잡아 주세요." />
      </label>
      <div className="mt-2 flex gap-2">
        <Button variant="primary" onClick={() => void start()} disabled={busy}>
          {busy ? "요청 중…" : "다시 분석 요청"}
        </Button>
        <Button onClick={() => setOpen(false)} disabled={busy}>
          취소
        </Button>
      </div>
    </div>
  );
}
