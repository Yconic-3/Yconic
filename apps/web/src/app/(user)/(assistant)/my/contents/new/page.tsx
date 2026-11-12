"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABELS,
  type ContentJob,
  type ContentJobStatus,
  type Difficulty,
  type ExerciseCategory,
} from "@yconic/shared-types";
import { LoginRequired } from "@/user/components/creator-ui";
import { Button, ICONS, INPUT_CLASS, Section } from "@/user/components/ui";
import { createCreatorApi, creatorErrorMessage } from "@/user/lib/creator-api";
import { usePage, usePageCommands, useShell } from "@/user/lib/shell";

/** 작업 단계마다 올린 사람에게 보여 줄 말 */
const STAGE_MESSAGES: Record<ContentJobStatus, string> = {
  QUEUED: "분석 차례를 기다리는 중입니다.",
  ANALYZING_VIDEO: "영상에서 동작과 신체 위치를 읽는 중입니다.",
  EXTRACTING_STEPS: "기존 내레이션을 받아 적고 화면 자막과 비교하는 중입니다.",
  GENERATING_SCRIPT: "단계별 음성 안내 초안을 만드는 중입니다.",
  GENERATING_TTS: "음성 파일을 만드는 중입니다.",
  COMPLETED: "분석이 끝났습니다.",
  FAILED: "분석에 실패했습니다.",
};

const POLL_MS = 1200;

/**
 * 새 콘텐츠 만들기 (/my/contents/new).
 * 영상 파일을 고르고 "분석 시작" → 업로드 → AI 제작 작업 → 끝나면 초안 확인 화면으로 간다.
 */
export default function NewContentPage() {
  const { account, say } = useShell();
  const router = useRouter();
  const api = useMemo(() => createCreatorApi(), []);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ExerciseCategory>("STRENGTH");
  const [difficulty, setDifficulty] = useState<Difficulty>("BEGINNER");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<ContentJob | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  usePage({ mode: "supply", title: "새 콘텐츠 만들기", chips: ["분석 시작", "내 콘텐츠"] });

  // 작업이 끝날 때까지 상태를 확인한다
  useEffect(() => {
    if (!job || job.status === "COMPLETED" || job.status === "FAILED") return;
    const timer = window.setTimeout(() => {
      api
        .getJob(job.id)
        .then((next) => {
          setJob(next);
          if (next.status !== job.status) setBusy(STAGE_MESSAGES[next.status]);
          if (next.status === "COMPLETED" && next.contentId) {
            setBusy(null);
            void say("분석이 끝났습니다. 화면에서만 전달되던 정보와 단계별 안내 초안을 확인하고 검수를 요청해 주세요.");
            router.replace(`/my/contents/${encodeURIComponent(next.contentId)}`);
          }
          if (next.status === "FAILED") {
            setBusy(null);
            setError(`분석에 실패했습니다. ${next.failureReason ?? ""} 다른 영상으로 다시 시도해 주세요.`);
            void say("분석에 실패했습니다. 다른 영상으로 다시 시도해 주세요.");
          }
        })
        .catch((e) => {
          setBusy(null);
          setError(creatorErrorMessage(e));
        });
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [api, job, router, say]);

  async function start() {
    if (busy) return;
    if (!title.trim()) {
      setError("운동 이름을 입력해 주세요.");
      void say("운동 이름을 먼저 입력해 주세요.");
      return;
    }
    if (!file) {
      setError("운동 영상 파일을 골라 주세요.");
      void say("먼저 운동 영상 파일을 골라 주세요.");
      return;
    }
    setError(null);
    setBusy("영상을 올리는 중입니다.");
    void say("영상 분석을 시작합니다.");
    let videoId: string | null = null;
    try {
      const video = await api.uploadVideo(file, (f) => setBusy(`영상을 올리는 중입니다. ${Math.round(f * 100)}퍼센트.`));
      videoId = video.id;
      const created = await api.createJob({ videoId, title: title.trim(), category, difficulty, requestNote: note.trim() });
      setJob(created);
      setBusy(STAGE_MESSAGES[created.status]);
    } catch (e) {
      // 작업을 만들지 못했으면 올린 영상을 지운다
      if (videoId) await api.deleteVideo(videoId).catch(() => undefined);
      setBusy(null);
      setError(creatorErrorMessage(e));
      void say(`분석을 시작하지 못했습니다. ${creatorErrorMessage(e)}`);
    }
  }

  usePageCommands((text) => {
    if (text.includes("분석")) {
      void start();
      return true;
    }
    return false;
  });

  if (!account) return <LoginRequired />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void start();
  };

  return (
    <Section id="new-title" title="운동 영상 올리기">
      <p className="m-0 text-[18px] text-ink-2">
        영상을 올리면 AI가 화면에서만 전달되던 정보(동작 방향, 신체 위치, 자막, 횟수)를 찾고 단계별 음성 안내 초안을 만듭니다. 초안을 확인한 뒤 검수를 요청하면 운영자가 검수하고 공개합니다.
      </p>
      {busy ? (
        <p role="status" className="m-0 rounded-2xl border-2 border-info bg-panel px-5 py-[22px] text-[21px]">
          <span className="font-bold text-info">분석 중.</span> {busy}
          {job && job.status !== "QUEUED" ? ` (${job.progress}%)` : ""}
        </p>
      ) : (
        <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
          <label htmlFor="new-title-input" className="flex flex-col gap-2">
            <span className="text-[21px] font-bold">운동 이름</span>
            <input id="new-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 사이드 레그 레이즈" className={INPUT_CLASS} />
          </label>
          <div className="flex flex-wrap gap-4">
            <label htmlFor="new-category" className="flex min-w-[200px] flex-1 flex-col gap-2">
              <span className="text-[21px] font-bold">분류</span>
              <select id="new-category" value={category} onChange={(e) => setCategory(e.target.value as ExerciseCategory)} className={INPUT_CLASS}>
                {EXERCISE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXERCISE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="new-difficulty" className="flex min-w-[200px] flex-1 flex-col gap-2">
              <span className="text-[21px] font-bold">난이도</span>
              <select id="new-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className={INPUT_CLASS}>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label htmlFor="new-video" className="flex flex-col gap-2">
            <span className="text-[21px] font-bold">운동 영상 파일</span>
            <input
              id="new-video"
              type="file"
              accept="video/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f) void say(`${f.name} 파일을 골랐습니다.`);
              }}
              aria-describedby="new-video-help"
              className="min-h-[68px] w-full rounded-2xl border-[3px] border-dashed border-control bg-panel p-[18px] text-[18px] text-ink"
            />
            <span id="new-video-help" className="text-[17px] text-ink-3">
              {file ? `선택됨: ${file.name}` : "mp4나 webm 영상을 골라 주세요."}
            </span>
          </label>
          <label htmlFor="new-note" className="flex flex-col gap-2">
            <span className="text-[21px] font-bold">AI에게 전할 말 (선택)</span>
            <textarea
              id="new-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 의자를 잡고 하는 동작입니다."
              className="w-full rounded-2xl border-[3px] border-ink bg-bg px-4 py-3.5 text-[19px] leading-normal text-ink placeholder:text-ink-3"
            />
          </label>
          {error && (
            <p role="alert" className="m-0 rounded-2xl border-2 border-warn bg-warn-tint px-[18px] py-4 font-bold text-warn-ink">
              {error}
            </p>
          )}
          <Button type="submit" tone="primary" size="xl" icon={ICONS.search}>
            분석 시작
          </Button>
        </form>
      )}
    </Section>
  );
}
