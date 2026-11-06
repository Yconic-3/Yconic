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
import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useAdmin, useSession } from "@/lib/session";

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
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hasPermission(user.role, "job:create")) {
    return <Alert kind="error">제작 작업을 만들 권한이 없습니다.</Alert>;
  }

  function onFile(f: File | null) {
    setFile(f);
    setFileError(null);
    if (!f) return;
    if (!f.type.startsWith("video/")) setFileError("영상 파일만 올릴 수 있습니다.");
    else if (f.size > MAX_VIDEO_BYTES) setFileError("영상은 2GB 이하여야 합니다.");
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || fileError) {
      setFileError(fileError ?? "운동 영상을 선택해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 실제 업로드는 백엔드가 준비되면 S3 호환 스토리지로 올린 뒤 url을 넣는다.
      await api.createJob({
        title,
        category,
        difficulty,
        requestNote,
        sourceVideo: { fileName: file.name, sizeBytes: file.size, url: null },
      });
      router.push("/jobs");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="새 AI 제작 요청" description="운동 영상과 기본 정보를 주면 AI가 단계별 설명과 음성 안내 초안을 만듭니다." actions={<LinkButton href="/jobs">취소</LinkButton>} />
      {mode === "mock" && (
        <div className="mb-4">
          <Alert kind="info">모의 모드에서는 영상을 실제로 올리지 않고 파일 이름만 기록합니다. 파일 이름에 &quot;fail&quot;이 들어가면 실패 상황을 시연합니다.</Alert>
        </div>
      )}
      <form onSubmit={(e) => void submit(e)} noValidate>
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="운동 영상" required error={fileError ?? undefined} hint={file ? `${file.name} (${formatBytes(file.size)})` : "mp4, mov 등 영상 파일. 전신이 잘 보이는 밝은 영상일수록 분석이 정확합니다."}>
                <Input type="file" accept="video/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="운동 이름" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="예: 앉아서 하는 목 스트레칭" />
              </Field>
            </div>
            <Field label="분류">
              <Select value={category} onChange={(e) => setCategory(e.target.value as ExerciseCategory)}>
                {EXERCISE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXERCISE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="난이도">
              <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABELS[d]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="AI에게 전달할 요청 사항" hint="예: 손목이 약한 분도 할 수 있게 설명해 주세요. 휴식 시간을 넉넉히 잡아 주세요.">
                <Textarea value={requestNote} onChange={(e) => setRequestNote(e.target.value)} />
              </Field>
            </div>
          </div>
          {error && (
            <div className="mt-4">
              <Alert kind="error">{error}</Alert>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
              {busy ? "요청 중…" : "제작 요청"}
            </Button>
            <LinkButton href="/jobs">취소</LinkButton>
          </div>
        </Card>
      </form>
    </>
  );
}
