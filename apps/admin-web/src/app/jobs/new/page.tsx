"use client";

import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABELS,
  hasPermission,
  type Difficulty,
  type ExerciseCategory,
} from "@yconic/shared-types";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useAdmin, useSession } from "@/lib/session";
import { formatTimecode, readVideoMetadata, type VideoMetadata } from "@/lib/video";

const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export default function NewJobPage() {
  const { user, api } = useAdmin();
  const { mode } = useSession();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ExerciseCategory>("STRETCHING");
  const [difficulty, setDifficulty] = useState<Difficulty>("BEGINNER");
  const [requestNote, setRequestNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<VideoMetadata | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!hasPermission(user.role, "job:create")) {
    return <Alert kind="error">제작 작업을 만들 권한이 없습니다.</Alert>;
  }

  async function onFile(f: File | null) {
    setFile(f);
    setMeta(null);
    setFileError(null);
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setFileError("영상 파일만 올릴 수 있습니다.");
      return;
    }
    if (f.size > MAX_VIDEO_BYTES) {
      setFileError("영상은 2GB 이하여야 합니다.");
      return;
    }
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
    try {
      setMeta(await readVideoMetadata(f));
    } catch (e) {
      setFileError(errorMessage(e));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || fileError || !meta) {
      setFileError(fileError ?? "운동 영상을 선택해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const video = await api.uploadVideo(file, setProgress);
      await api.createJob({ videoId: video.id, title, category, difficulty, requestNote });
      router.push("/jobs");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <>
      <PageHeader title="새 AI 제작 요청" description="운동 영상을 올리면 AI가 영상을 분석해 동작 구간을 나누고 구간별 음성 안내 초안을 만듭니다." actions={<LinkButton href="/jobs">취소</LinkButton>} />
      {mode === "mock" && (
        <div className="mb-4">
          <Alert kind="info">
            모의 모드에서는 영상이 이 브라우저 안에만 저장되고, 분석은 영상 내용을 보지 않고 길이로만 구간을 나눕니다. 파일 이름에 &quot;fail&quot;이 들어가면 실패 상황을 시연합니다.
          </Alert>
        </div>
      )}
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card title="1. 운동 영상">
            <Field label="영상 파일" required error={fileError ?? undefined} hint="mp4, webm 등 브라우저가 재생할 수 있는 영상. 전신이 잘 보이는 밝은 영상일수록 분석이 정확합니다.">
              <Input type="file" accept="video/*" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} disabled={busy} />
            </Field>
            {previewUrl && !fileError && (
              <div className="mt-3">
                <video src={previewUrl} controls playsInline className="max-h-80 w-full rounded-md bg-black" />
              </div>
            )}
            {file && meta && (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-slate-500">파일</dt>
                <dd className="truncate">{file.name}</dd>
                <dt className="text-slate-500">길이</dt>
                <dd>{formatTimecode(meta.durationSec)}</dd>
                <dt className="text-slate-500">해상도</dt>
                <dd>
                  {meta.width}×{meta.height}
                </dd>
                <dt className="text-slate-500">크기</dt>
                <dd>{formatBytes(file.size)}</dd>
              </dl>
            )}
          </Card>

          <Card title="2. 운동 정보">
            <div className="space-y-4">
              <Field label="운동 이름" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="예: 앉아서 하는 목 스트레칭" disabled={busy} />
              </Field>
              <Field label="분류">
                <Select value={category} onChange={(e) => setCategory(e.target.value as ExerciseCategory)} disabled={busy}>
                  {EXERCISE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXERCISE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="난이도">
                <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} disabled={busy}>
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABELS[d]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="AI에게 전달할 요청 사항" hint="예: 손목이 약한 분도 할 수 있게 설명해 주세요. 휴식 구간을 넉넉히 잡아 주세요.">
                <Textarea value={requestNote} onChange={(e) => setRequestNote(e.target.value)} disabled={busy} />
              </Field>

              {progress !== null && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-600">
                    <span>{progress < 1 ? "영상 올리는 중…" : "제작 작업 등록 중…"}</span>
                    <span>{Math.round(progress * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-slate-100" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="업로드 진행률">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress * 100}%` }} />
                  </div>
                </div>
              )}
              {error && <Alert kind="error">{error}</Alert>}

              <div className="flex gap-2">
                <Button type="submit" variant="primary" disabled={busy || !title.trim() || !file || !!fileError || !meta}>
                  {busy ? "처리 중…" : "영상 올리고 제작 요청"}
                </Button>
                <LinkButton href="/jobs">취소</LinkButton>
              </div>
            </div>
          </Card>
        </div>
      </form>
    </>
  );
}
