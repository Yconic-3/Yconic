"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DIFFICULTY_LABELS, EXERCISE_CATEGORY_LABELS, type Difficulty } from "@yconic/shared-types";
import { createUserApi, errorMessage, type PublishedExercise } from "@/user/lib/api";
import { matchesFilter } from "@/user/lib/api/user-api";
import { parseIntent } from "@/user/lib/intent";
import { goBack, goHome, INITIAL_NAV, navigate, type NavState, type View } from "@/user/lib/navigation";
import { formatDuration, SESSION_STATE_LABELS } from "@/user/lib/player";
import { startListening, type Listener, type ListenError } from "@/user/lib/recognition";
import { clampRate, RATE_STEP, speak, stopSpeaking } from "@/user/lib/speech";
import { useExerciseSession } from "@/user/lib/use-exercise-session";
import { Badge, Chip, LogoIcon, MicIcon, Panel } from "./ui";

/*
 * 사용자 화면 — 디자인 시안 B (말벗핏 · 밝은 톤, 대화형 음성 비서)
 * 위에서부터: 머리말 → 가운데 큰 마이크와 바로 말하기 → 대화 → 운동 목록 또는 단계 카드 → 글로 입력
 * 운동을 고르면 화면 아래에 "지금 안내 중" 막대가 붙어 이전·시작·다음·다시를 늘 누를 수 있다.
 */

const GREETING = '안녕하세요. 어떤 운동을 할까요? "하체 운동 찾아줘", "스쿼트 시작"처럼 말해 주세요.';
const SAFETY_MESSAGE =
  "운동을 멈췄습니다. 편한 자세로 쉬세요. 통증이나 어지럼, 숨찬 느낌이 계속되면 운동을 그만하고 주변 사람이나 의료진의 도움을 받으세요.";
const HELP_MESSAGE =
  "이렇게 말할 수 있습니다. 운동을 찾을 때는 스트레칭 찾아줘, 운동을 고를 때는 운동 이름과 시작. 운동 중에는 멈춰, 계속, 다음, 이전, 다시, 느리게, 빠르게. 화면을 옮길 때는 이전 화면, 홈.";

const LISTEN_ERROR_TEXT: Record<ListenError, string> = {
  unsupported: "이 브라우저는 음성 인식을 지원하지 않아요. 아래 칸에 글로 입력해 주세요.",
  denied: "마이크 사용이 허용되지 않았어요. 브라우저 설정에서 허용하거나 글로 입력해 주세요.",
  failed: "음성 인식이 잠시 끊겼어요. 마이크 버튼을 다시 눌러 주세요.",
};

/** 대화에 남기는 말은 최근 8개까지 */
const LOG_LIMIT = 8;

interface Message {
  id: number;
  who: "bot" | "me";
  text: string;
}

const DIFFICULTY_TONE: Record<Difficulty, "warm" | "cool" | "sand"> = {
  BEGINNER: "warm",
  INTERMEDIATE: "cool",
  ADVANCED: "sand",
};

function exerciseMeta(e: PublishedExercise): string {
  return `${EXERCISE_CATEGORY_LABELS[e.category]} · ${formatDuration(e.video.durationSec)}`;
}

export function AssistantApp() {
  const api = useMemo(() => createUserApi(), []);

  const [exercises, setExercises] = useState<PublishedExercise[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nav, setNav] = useState<NavState>(INITIAL_NAV);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [log, setLog] = useState<Message[]>([{ id: 0, who: "bot", text: GREETING }]);
  const [rate, setRate] = useState(1);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("가운데 버튼을 누르고 말하거나, 아래 예시를 눌러 보세요.");
  const [command, setCommand] = useState("");

  const rateRef = useRef(rate);
  rateRef.current = rate;
  const listenerRef = useRef<Listener | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const autoplayRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const firstViewRef = useRef(true);
  const messageSeq = useRef(1);

  const addMessage = useCallback((who: Message["who"], text: string) => {
    setLog((prev) => [...prev, { id: messageSeq.current++, who, text }].slice(-LOG_LIMIT));
  }, []);

  const loadExercises = useCallback(async () => {
    setLoadError(null);
    try {
      setExercises(await api.listExercises());
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [api]);

  useEffect(() => {
    void loadExercises();
  }, [loadExercises]);

  const view = nav.current;

  // 화면이 바뀌면 맨 위로 올리고 제목으로 초점을 옮겨, 스크린리더가 새 화면의 처음부터 읽게 한다.
  useEffect(() => {
    if (firstViewRef.current) {
      firstViewRef.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [view]);

  const exercise = useMemo(
    () => (view.name === "exercise" ? (exercises?.find((e) => e.id === view.exerciseId) ?? null) : null),
    [exercises, view],
  );

  /** 대화에 남기고 소리 내어 읽는다. 끝까지 읽으면 true */
  const say = useCallback(
    (text: string, audioUrl?: string | null) => {
      addMessage("bot", text);
      return speak(text, { rate: rateRef.current, audioUrl });
    },
    [addMessage],
  );

  const session = useExerciseSession(exercise, videoRef, say);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // 운동을 고르면 영상 주소를 받아 오고, "○○ 시작"으로 들어왔으면 바로 시작한다.
  useEffect(() => {
    setVideoUrl(null);
    if (!exercise) return;
    let cancelled = false;
    api
      .getVideoPlaybackUrl(exercise.video.id)
      .then((url) => {
        if (!cancelled) setVideoUrl(url);
      })
      .catch(() => {
        // 영상을 못 받아도 음성 안내로 운동할 수 있다.
      });
    const autoplay = autoplayRef.current;
    autoplayRef.current = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (autoplay) sessionRef.current.start();
      else void say(`${exercise.title}을 준비할게요. ${exercise.summary} "시작"이라고 말하면 1단계부터 안내합니다.`);
    }, 50);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, exercise, say]);

  // 화면을 떠날 때 소리와 마이크를 멈춘다.
  useEffect(
    () => () => {
      stopSpeaking();
      listenerRef.current?.stop();
    },
    [],
  );

  const viewName = useCallback(
    (v: View): string => {
      if (v.name === "home") return "홈";
      if (v.name === "list") return `${v.category ? EXERCISE_CATEGORY_LABELS[v.category] : (v.keyword ?? "전체")} 운동`;
      return exercises?.find((e) => e.id === v.exerciseId)?.title ?? "운동";
    },
    [exercises],
  );

  const listFor = useCallback(
    (v: View): PublishedExercise[] => {
      const all = exercises ?? [];
      if (v.name !== "list") return all;
      return all.filter((e) => matchesFilter(e, { category: v.category ?? undefined, keyword: v.keyword ?? undefined }));
    },
    [exercises],
  );

  const openExercise = useCallback((id: string, autoplay: boolean) => {
    stopSpeaking();
    autoplayRef.current = autoplay;
    setNav((n) => navigate(n, { name: "exercise", exerciseId: id }));
  }, []);

  const handleHome = useCallback(() => {
    stopSpeaking();
    setNav(goHome());
    void say("처음 화면이에요. 어떤 운동을 할까요?");
  }, [say]);

  const handleBack = useCallback(() => {
    stopSpeaking();
    const next = goBack(nav);
    setNav(next);
    // 운동 화면으로 돌아가면 그 화면이 스스로 안내한다.
    if (next.current.name !== "exercise") void say(`이전 화면, ${viewName(next.current)}이에요.`);
  }, [nav, say, viewName]);

  const changeRate = useCallback(
    (delta: number) => {
      const next = clampRate(rateRef.current + delta);
      rateRef.current = next;
      setRate(next);
      void say(`말하기 속도 ${next.toFixed(2)}배입니다.`);
    },
    [say],
  );

  const handleCommand = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      addMessage("me", text);
      const all = exercises ?? [];
      const intent = parseIntent(text, all);
      const s = sessionRef.current;

      switch (intent.type) {
        case "SAFETY":
          s.stop();
          void say(SAFETY_MESSAGE);
          return;
        case "HOME":
          handleHome();
          return;
        case "BACK":
          handleBack();
          return;
        case "HELP":
          void say(HELP_MESSAGE);
          return;
        case "LIST": {
          const target: View = { name: "list", category: intent.category, keyword: intent.keyword };
          const found = all.filter((e) => matchesFilter(e, { category: intent.category ?? undefined, keyword: intent.keyword ?? undefined }));
          stopSpeaking();
          setNav((n) => navigate(n, target));
          const label = intent.category ? EXERCISE_CATEGORY_LABELS[intent.category] : (intent.keyword ?? "");
          void say(
            found.length
              ? `${label ? `${label} 운동은 ` : "할 수 있는 운동은 "}${found.map((e) => e.title).join(", ")}이에요. 이름을 말하면 안내를 시작할게요.`
              : `${label} 운동을 찾지 못했어요. "홈"이라고 말하면 전체 목록으로 돌아갑니다.`,
          );
          return;
        }
        case "OPEN":
          if (exercise?.id === intent.exerciseId) {
            if (intent.autoplay) s.start();
            else void say(`${exercise.title}이에요. "시작"이라고 말하면 안내를 시작합니다.`);
          } else {
            openExercise(intent.exerciseId, intent.autoplay);
          }
          return;
        case "SLOWER":
          changeRate(-RATE_STEP);
          return;
        case "FASTER":
          changeRate(RATE_STEP);
          return;
        case "UNKNOWN":
          void say("잘 못 들었어요. 도움말이라고 말하면 쓸 수 있는 말을 알려 드릴게요.");
          return;
      }

      // 여기부터는 운동을 고른 뒤에만 쓰는 재생 명령
      if (!exercise) {
        void say('먼저 운동을 골라 주세요. "하체 운동 찾아줘"나 "스쿼트 시작"이라고 말해 보세요.');
        return;
      }
      switch (intent.type) {
        case "START":
          s.start();
          return;
        case "PAUSE":
          stopSpeaking();
          s.pause();
          void say('잠시 멈췄어요. "계속"이라고 말하면 이어서 안내합니다.');
          return;
        case "NEXT":
          s.next();
          return;
        case "PREVIOUS":
          s.previous();
          return;
        case "REPEAT":
          s.repeat();
          return;
      }
    },
    [addMessage, changeRate, exercise, exercises, handleBack, handleHome, openExercise, say],
  );

  const handleCommandRef = useRef(handleCommand);
  handleCommandRef.current = handleCommand;

  const toggleListening = useCallback(() => {
    if (listenerRef.current) {
      listenerRef.current.stop();
      listenerRef.current = null;
      setListening(false);
      setVoiceStatus("듣기를 껐어요.");
      return;
    }
    const listener = startListening({
      onText: (text) => {
        setVoiceStatus(`들린 말: "${text}"`);
        handleCommandRef.current(text);
      },
      onError: (error) => {
        setVoiceStatus(LISTEN_ERROR_TEXT[error]);
        if (error !== "failed") {
          listenerRef.current = null;
          setListening(false);
        }
      },
    });
    if (listener) {
      listenerRef.current = listener;
      setListening(true);
      setVoiceStatus("듣고 있어요. 편하게 말씀하세요.");
    }
  }, []);

  const submitCommand = (e: FormEvent) => {
    e.preventDefault();
    const text = command;
    setCommand("");
    handleCommand(text);
  };

  const togglePlay = () => {
    if (session.playing) {
      stopSpeaking();
      session.pause();
      void say('잠시 멈췄어요. "계속"이라고 말하면 이어서 안내합니다.');
    } else {
      session.start();
    }
  };

  const list = listFor(view);
  const lastBotText = [...log].reverse().find((m) => m.who === "bot")?.text ?? GREETING;
  const currentSegment = exercise?.segments[session.segmentIndex] ?? null;

  const headline = exercise
    ? session.playing
      ? `${exercise.title} 안내 중이에요`
      : `${exercise.title}, 준비되면 "시작"`
    : view.name === "list"
      ? `${viewName(view)}을 골라 보세요`
      : "오늘은 어떤 운동을 할까요?";
  const subline = exercise
    ? '말로 조작하세요: "다음", "이전", "다시", "멈춰". 화면 아래에 지금 단계가 항상 표시됩니다.'
    : "화면을 보지 않아도 됩니다. 말로 운동을 찾고, 구간마다 음성 안내를 들으며, 말로 재생을 조작하세요.";
  const chips = exercise ? ["시작", "다음", "다시", "멈춰"] : ["하체 운동 찾아줘", "스트레칭 찾아줘", "스쿼트 시작", "도움말"];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── 머리말 ── */}
      <header className="border-b-2 border-line bg-bg">
        <div className="mx-auto flex max-w-[980px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-[18px]">
          <div className="flex items-center gap-3">
            <span className="text-accent">
              <LogoIcon />
            </span>
            <span className="whitespace-nowrap font-display text-[28px] font-black">말벗핏</span>
            <span className="hidden text-base text-ink-3 sm:inline">말로 묻고, 말로 안내받는 운동 비서</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sand px-3.5 py-2 text-base font-bold">말 속도 {rate.toFixed(2)}배</span>
            <button
              type="button"
              onClick={toggleListening}
              aria-pressed={listening}
              className={`min-h-[52px] rounded-full border-2 border-accent px-[18px] font-bold ${listening ? "bg-accent text-white" : "bg-surface text-accent"}`}
            >
              {listening ? "듣는 중" : "마이크"}
            </button>
          </div>
        </div>
      </header>

      <main
        id="main"
        className={`mx-auto box-border flex w-full max-w-[980px] flex-1 flex-col gap-8 px-4 pt-9 ${exercise ? "pb-40" : "pb-16"}`}
      >
        {/* ── 가운데 음성 비서 ── */}
        <section aria-label="음성 비서" className="flex flex-col items-center gap-5 text-center">
          <h1 ref={headingRef} tabIndex={-1} className="m-0 font-display text-[clamp(30px,6vw,44px)] font-black leading-tight">
            {headline}
          </h1>
          <p className="m-0 max-w-[640px] font-display text-[21px] text-ink-3">{subline}</p>
          <button
            type="button"
            onClick={toggleListening}
            aria-pressed={listening}
            aria-label={listening ? "듣는 중, 눌러서 끄기" : "눌러서 말하기"}
            className={`flex h-[180px] w-[180px] flex-col items-center justify-center gap-1.5 rounded-full border-[6px] shadow-[0_10px_30px_rgba(194,65,12,0.18)] ${
              listening ? "border-accent bg-accent text-white" : "border-control bg-surface text-accent"
            }`}
          >
            <MicIcon />
            <span className="text-lg font-bold">{listening ? "듣는 중 · 끄기" : "눌러서 말하기"}</span>
          </button>
          <p role="status" className="m-0 text-lg text-ink-3">
            {voiceStatus}
          </p>
          <div role="group" aria-label="바로 말하기" className="flex flex-wrap justify-center gap-2.5">
            {chips.map((c) => (
              <Chip key={c} onClick={() => handleCommand(c)}>
                “{c}”
              </Chip>
            ))}
          </div>
          <div role="group" aria-label="말하기 속도" className="flex flex-wrap items-center justify-center gap-2.5">
            <Chip className="min-h-[48px] text-[17px]" onClick={() => changeRate(-RATE_STEP)}>
              느리게
            </Chip>
            <Chip className="min-h-[48px] text-[17px]" onClick={() => changeRate(RATE_STEP)}>
              빠르게
            </Chip>
          </div>
        </section>

        {/* ── 대화 ── */}
        <section aria-labelledby="log-title" className="flex flex-col gap-3.5">
          <h2 id="log-title" className="sr-only">
            대화
          </h2>
          <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
            {log.map((m) => (
              <li key={m.id} className={`flex ${m.who === "me" ? "justify-end" : "justify-start"}`}>
                <p
                  className={`m-0 max-w-[78%] whitespace-pre-line rounded-[18px] border-2 px-5 py-4 text-left ${
                    m.who === "me" ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink"
                  }`}
                >
                  <span className="sr-only">{m.who === "me" ? "나" : "말벗핏"}: </span>
                  {m.text}
                </p>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => void speak(lastBotText, { rate: rateRef.current })} className="self-start text-lg font-bold text-accent underline underline-offset-4 hover:text-accent-strong">
            마지막 안내 다시 듣기
          </button>
        </section>

        {/* ── 운동 목록 ── */}
        {!exercise && (
          <Panel
            id="list-title"
            title={view.name === "list" ? viewName(view) : "할 수 있는 운동"}
            actions={
              view.name === "list" && (
                <Chip className="min-h-[48px] text-[17px]" onClick={handleHome}>
                  전체 운동 보기
                </Chip>
              )
            }
          >
            {loadError ? (
              <>
                <p role="alert" className="m-0 text-ink-2">
                  운동 목록을 불러오지 못했어요. {loadError}
                </p>
                <Chip className="self-start" onClick={() => void loadExercises()}>
                  다시 시도
                </Chip>
              </>
            ) : exercises === null ? (
              <p className="m-0 text-ink-2">운동 목록을 불러오는 중이에요.</p>
            ) : list.length === 0 ? (
              <p className="m-0 text-ink-2">해당하는 운동이 없어요.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {list.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        addMessage("me", `${e.title} 시작`);
                        openExercise(e.id, true);
                      }}
                      className="flex min-h-[68px] w-full flex-wrap items-center gap-3 rounded-[14px] border-2 border-control bg-bg px-[18px] py-3 text-left text-ink hover:border-ink"
                    >
                      <span className="text-[22px] font-bold">{e.title}</span>
                      <span className="text-[17px] text-ink-3">{exerciseMeta(e)}</span>
                      <span className="ml-auto">
                        <Badge tone={DIFFICULTY_TONE[e.difficulty]}>{DIFFICULTY_LABELS[e.difficulty]}</Badge>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {/* ── 단계 ── */}
        {exercise && (
          <Panel
            id="steps-title"
            title={`${exercise.title} 단계`}
            actions={
              <>
                <Badge tone={DIFFICULTY_TONE[exercise.difficulty]}>{DIFFICULTY_LABELS[exercise.difficulty]}</Badge>
                <Chip className="min-h-[48px] text-[17px]" onClick={handleHome}>
                  운동 목록으로
                </Chip>
              </>
            }
          >
            {videoUrl ? (
              // 영상의 소리와 음성 안내가 함께 나온다. 자막 파일은 아직 없다.
              <video ref={videoRef} src={videoUrl} playsInline preload="metadata" className="w-full rounded-[14px] bg-ink" aria-label={`${exercise.title} 영상`} />
            ) : (
              <p className="m-0 text-lg text-ink-3">이 운동은 영상 없이 음성 안내로 진행합니다.</p>
            )}
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {exercise.segments.map((seg, i) => {
                const current = i === session.segmentIndex;
                return (
                  <li key={seg.id}>
                    <button
                      type="button"
                      onClick={() => session.goToSegment(i)}
                      aria-current={current ? "step" : undefined}
                      className={`flex min-h-[56px] w-full items-start gap-3.5 rounded-[14px] border-2 px-4 py-3.5 text-left text-ink ${
                        current ? "border-accent bg-accent-tint" : "border-control bg-surface hover:border-ink"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full font-bold ${current ? "bg-accent text-white" : "bg-sand text-ink"}`}
                      >
                        {i + 1}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2 font-bold">
                          <span className="sr-only">{i + 1}단계, </span>
                          {seg.title}
                          {/* 색만으로 알리지 않도록 지금 단계에는 글자 꼬리표를 붙인다 */}
                          {current && <Badge tone="warm">지금</Badge>}
                        </span>
                        <span className="text-lg text-ink-2">{seg.voiceGuide || "이 구간에는 음성 안내가 없어요."}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {exercise.precautions.length > 0 && (
              <p className="m-0 rounded-xl border-2 border-accent-soft bg-accent-tint px-4 py-3.5 text-warn-ink">
                <span className="font-bold">주의</span> · {exercise.precautions.join(" ")}
              </p>
            )}
          </Panel>
        )}

        {/* ── 글로 입력 ── */}
        <form onSubmit={submitCommand} className="flex items-stretch gap-2.5">
          <label htmlFor="command" className="sr-only">
            말 대신 글로 입력
          </label>
          <input
            id="command"
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="말 대신 글로: 예) 스쿼트 시작, 다음, 멈춰"
            autoComplete="off"
            className="min-h-[60px] min-w-0 flex-auto rounded-[14px] border-2 border-control bg-surface px-[18px] text-ink placeholder:text-ink-3"
          />
          <button type="submit" className="min-h-[60px] rounded-[14px] bg-ink px-[22px] font-bold text-white">
            보내기
          </button>
        </form>
      </main>

      {/* ── 지금 안내 중 (운동을 골랐을 때 화면 아래에 붙는다) ── */}
      {exercise && (
        <div role="region" aria-label="지금 안내 중" className="sticky bottom-0 border-t-4 border-accent bg-ink text-white">
          <div className="mx-auto flex max-w-[980px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5">
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
              <span className="text-[15px] font-bold text-accent-soft">{session.playing ? "지금 안내 중" : SESSION_STATE_LABELS[session.state]}</span>
              <span className="truncate text-xl font-bold">
                {exercise.title} · {session.segmentIndex + 1}/{exercise.segments.length} {currentSegment?.title ?? ""}
              </span>
            </div>
            <div role="group" aria-label="재생 조작" className="flex gap-2">
              <button type="button" onClick={session.previous} className="min-h-[56px] min-w-[56px] rounded-xl border-2 border-white bg-transparent px-4 font-bold text-white">
                이전
              </button>
              <button type="button" onClick={togglePlay} className="min-h-[56px] rounded-xl bg-accent px-6 text-xl font-bold text-white hover:bg-accent-strong">
                {session.playing ? "멈춤" : session.started && session.state === "PAUSED" ? "계속" : "시작"}
              </button>
              <button type="button" onClick={session.next} className="min-h-[56px] min-w-[56px] rounded-xl border-2 border-white bg-transparent px-4 font-bold text-white">
                다음
              </button>
              <button type="button" onClick={session.repeat} className="min-h-[56px] rounded-xl border-2 border-accent-soft bg-transparent px-4 font-bold text-accent-soft">
                다시
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
