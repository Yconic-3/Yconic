"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DIFFICULTY_LABELS, EXERCISE_CATEGORY_LABELS } from "@yconic/shared-types";
import { createUserApi, errorMessage, type PublishedExercise } from "@/lib/api";
import { matchesFilter } from "@/lib/api/user-api";
import { parseIntent } from "@/lib/intent";
import { goBack, goHome, INITIAL_NAV, isHome, navigate, type NavState, type View } from "@/lib/navigation";
import { formatDuration, SESSION_STATE_LABELS } from "@/lib/player";
import { startListening, type Listener, type ListenError } from "@/lib/recognition";
import { clampRate, RATE_STEP, speak, stopSpeaking } from "@/lib/speech";
import { useExerciseSession } from "@/lib/use-exercise-session";
import { BackIcon, HomeIcon, MicIcon, RowButton, Section } from "./ui";

const GREETING = '안녕하세요. 어떤 운동을 할까요? 아래에서 운동을 고르거나 "스트레칭 찾아줘"처럼 말해 주세요.';
const SAFETY_MESSAGE =
  "운동을 멈췄습니다. 편한 자세로 쉬세요. 통증이나 어지럼, 숨찬 느낌이 계속되면 운동을 그만하고 주변 사람이나 의료진의 도움을 받으세요.";
const HELP_MESSAGE =
  "이렇게 말할 수 있습니다. 운동을 찾을 때는 스트레칭 찾아줘, 운동을 고를 때는 운동 이름과 시작. 운동 중에는 멈춰, 계속, 다음, 이전, 다시, 느리게, 빠르게. 화면을 옮길 때는 이전 화면, 홈.";

const LISTEN_ERROR_TEXT: Record<ListenError, string> = {
  unsupported: "이 브라우저는 음성 인식을 지원하지 않습니다. 아래 입력칸에 글로 적어 주세요.",
  denied: "마이크 사용이 허용되지 않았습니다. 브라우저 설정에서 허용하거나 글로 입력해 주세요.",
  failed: "음성 인식이 잠시 끊겼습니다. 마이크 버튼을 다시 눌러 주세요.",
};

function exerciseMeta(e: PublishedExercise): string {
  return `${EXERCISE_CATEGORY_LABELS[e.category]}, ${DIFFICULTY_LABELS[e.difficulty]}, ${formatDuration(e.video.durationSec)}`;
}

export function AssistantApp() {
  const api = useMemo(() => createUserApi(), []);

  const [exercises, setExercises] = useState<PublishedExercise[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nav, setNav] = useState<NavState>(INITIAL_NAV);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [lastSaid, setLastSaid] = useState(GREETING);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("화면 맨 아래 큰 버튼을 누르고 말하세요.");
  const [command, setCommand] = useState("");

  const rateRef = useRef(rate);
  rateRef.current = rate;
  const listenerRef = useRef<Listener | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const autoplayRef = useRef(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const firstViewRef = useRef(true);

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
    mainRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [view]);
  const exercise = useMemo(
    () => (view.name === "exercise" ? (exercises?.find((e) => e.id === view.exerciseId) ?? null) : null),
    [exercises, view],
  );

  /** 화면에 적고 소리 내어 읽는다. 끝까지 읽으면 true */
  const say = useCallback((text: string, audioUrl?: string | null) => {
    setLastSaid(text);
    return speak(text, { rate: rateRef.current, audioUrl });
  }, []);

  const session = useExerciseSession(exercise, videoRef, say);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // 운동 화면에 들어오면 영상 주소를 받아 오고, "○○ 시작"으로 들어왔으면 바로 시작한다.
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
      else void say(`${exercise.title}. ${exercise.summary} 시작 버튼을 누르거나 시작이라고 말하면 안내를 시작합니다.`);
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
      if (v.name === "list") return `${v.category ? EXERCISE_CATEGORY_LABELS[v.category] : (v.keyword ?? "전체")} 운동 목록`;
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
    void say("홈 화면입니다. 어떤 운동을 할까요?");
  }, [say]);

  const handleBack = useCallback(() => {
    stopSpeaking();
    const next = goBack(nav);
    setNav(next);
    // 운동 화면으로 돌아가면 그 화면이 스스로 안내한다.
    if (next.current.name !== "exercise") void say(`이전 화면, ${viewName(next.current)}입니다.`);
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
      setLastHeard(text);
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
              ? `${label ? `${label} 운동은 ` : "할 수 있는 운동은 "}${found.map((e) => e.title).join(", ")}입니다. 운동 이름을 말하면 열어 드립니다.`
              : `${label} 운동을 찾지 못했습니다. 홈이라고 말하면 전체 목록으로 돌아갑니다.`,
          );
          return;
        }
        case "OPEN":
          if (exercise?.id === intent.exerciseId) {
            if (intent.autoplay) s.start();
            else void say(`${exercise.title} 화면입니다. 시작이라고 말하면 안내를 시작합니다.`);
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
          void say("잘 이해하지 못했습니다. 도움말이라고 말하면 쓸 수 있는 말을 알려 드립니다.");
          return;
      }

      // 여기부터는 운동 화면에서만 쓰는 재생 명령
      if (!exercise) {
        void say("먼저 운동을 골라 주세요. 운동 이름을 말하거나 목록에서 누르면 됩니다.");
        return;
      }
      switch (intent.type) {
        case "START":
          s.start();
          return;
        case "PAUSE":
          stopSpeaking();
          s.pause();
          void say("멈췄습니다. 계속이라고 말하면 이어서 안내합니다.");
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
    [changeRate, exercise, exercises, handleBack, handleHome, openExercise, say],
  );

  const handleCommandRef = useRef(handleCommand);
  handleCommandRef.current = handleCommand;

  const toggleListening = useCallback(() => {
    if (listenerRef.current) {
      listenerRef.current.stop();
      listenerRef.current = null;
      setListening(false);
      setVoiceStatus("듣기를 껐습니다.");
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
      setVoiceStatus("듣고 있습니다. 편하게 말씀하세요.");
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
      void say("멈췄습니다. 시작 버튼을 누르면 이어서 안내합니다.");
    } else {
      session.start();
    }
  };

  const list = listFor(view);
  const headline = exercise ? `${exercise.title} · ${SESSION_STATE_LABELS[session.state]}` : view.name === "list" ? viewName(view) : "어떤 운동을 할까요?";
  const examples = exercise ? ["다음", "다시", "멈춰", "느리게"] : ["스트레칭 찾아줘", "스쿼트 시작", "도움말"];
  const currentSegment = exercise?.segments[session.segmentIndex] ?? null;
  const previousView = nav.history[nav.history.length - 1];

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[520px] flex-col bg-bg">
      <header className="flex-none border-b-2 border-line px-5 pb-3.5 pt-5">
        <p className="text-base font-bold text-accent">말벗핏</p>
        <h1 ref={headingRef} tabIndex={-1} className="text-[26px] font-black leading-snug">
          {headline}
        </h1>
      </header>

      <main ref={mainRef} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4">
        {!isHome(nav) && (
          <nav aria-label="화면 이동" className="flex flex-col gap-2">
            <RowButton variant="dark" onClick={handleBack}>
              <BackIcon />
              <span>{previousView ? `이전 화면으로 (${viewName(previousView)})` : "이전 화면으로"}</span>
            </RowButton>
            <RowButton onClick={handleHome}>
              <HomeIcon />
              <span>홈으로 가기</span>
            </RowButton>
          </nav>
        )}

        <Section id="last-title" title="방금 안내">
          <p className="rounded-2xl border-2 border-line bg-surface p-4 text-xl leading-relaxed">{lastSaid}</p>
          <p className="text-base text-ink-3">내가 한 말: {lastHeard ?? "아직 없음"}</p>
          <RowButton variant="soft" onClick={() => void say(lastSaid)}>
            방금 안내 다시 듣기
          </RowButton>
        </Section>

        {exercise && (
          <>
            <Section id="control-title" title="재생 조작">
              {videoUrl && (
                // 영상의 소리와 음성 안내가 함께 나온다. 자막 파일은 아직 없다.
                <video ref={videoRef} src={videoUrl} playsInline preload="metadata" className="w-full rounded-2xl bg-ink" aria-label={`${exercise.title} 영상`} />
              )}
              <p className="text-base text-ink-2">
                {currentSegment
                  ? `${exercise.segments.length}단계 중 ${session.segmentIndex + 1}단계, ${currentSegment.title}. ${SESSION_STATE_LABELS[session.state]}.`
                  : SESSION_STATE_LABELS[session.state]}
                {!videoUrl && " 영상 없이 음성 안내로 진행합니다."}
              </p>
              <RowButton variant="primary" size="lg" className="justify-center" onClick={togglePlay}>
                {session.playing ? "멈춤" : session.started && session.state === "PAUSED" ? "이어서 시작" : "시작"}
              </RowButton>
              <RowButton onClick={session.next}>다음 단계</RowButton>
              <RowButton onClick={session.repeat}>지금 단계 다시 듣기</RowButton>
              <RowButton onClick={session.previous}>이전 단계</RowButton>
              {exercise.precautions.length > 0 && (
                <div className="rounded-2xl border-2 border-accent-soft bg-accent-tint px-4 py-3.5 text-[17px] text-warn-ink">
                  <p className="font-bold">운동 전 주의사항</p>
                  <ul className="list-disc pl-5">
                    {exercise.precautions.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            <Section id="segments-title" title="전체 단계">
              <ol className="flex flex-col gap-2">
                {exercise.segments.map((seg, i) => {
                  const current = session.started && i === session.segmentIndex;
                  return (
                    <li key={seg.id}>
                      <button
                        type="button"
                        onClick={() => session.goToSegment(i)}
                        aria-current={current ? "step" : undefined}
                        className={`flex min-h-[64px] w-full flex-col gap-1 rounded-2xl border-[3px] px-4 py-3.5 text-left ${
                          current ? "border-accent bg-accent-tint" : "border-control bg-surface"
                        }`}
                      >
                        <span className="text-[19px] font-bold">
                          {i + 1}단계. {seg.title}
                          {current && " (지금)"}
                        </span>
                        <span className="text-[17px] text-ink-2">{seg.voiceGuide || "이 구간에는 음성 안내가 없습니다."}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </Section>
          </>
        )}

        {!exercise && (
          <Section id="list-title" title={view.name === "list" ? `${viewName(view)}에서 고르기` : "운동 고르기"}>
            {loadError ? (
              <>
                <p role="alert" className="text-ink-2">
                  운동 목록을 불러오지 못했습니다. {loadError}
                </p>
                <RowButton onClick={() => void loadExercises()}>다시 시도</RowButton>
              </>
            ) : exercises === null ? (
              <p className="text-ink-2">운동 목록을 불러오는 중입니다.</p>
            ) : list.length === 0 ? (
              <p className="text-ink-2">해당하는 운동이 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {list.map((e) => (
                  <li key={e.id}>
                    <RowButton className="min-h-[72px] flex-col !items-start !gap-0.5" onClick={() => openExercise(e.id, false)}>
                      <span className="text-[21px] font-bold">{e.title}</span>
                      <span className="text-base font-normal text-ink-2">{exerciseMeta(e)}</span>
                    </RowButton>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section id="rate-title" title="말하기 속도">
          <p className="text-base text-ink-2">지금 {rate.toFixed(2)}배</p>
          <RowButton variant="soft" onClick={() => changeRate(-RATE_STEP)}>
            느리게
          </RowButton>
          <RowButton variant="soft" onClick={() => changeRate(RATE_STEP)}>
            빠르게
          </RowButton>
        </Section>

        <Section id="examples-title" title="이렇게 말해 보세요">
          {examples.map((example) => (
            <RowButton key={example} variant="soft" className="min-h-[60px] text-[19px]" onClick={() => handleCommand(example)}>
              “{example}”
            </RowButton>
          ))}
        </Section>

        <form onSubmit={submitCommand} className="flex flex-col gap-2">
          <label htmlFor="command" className="text-xl font-black">
            말 대신 글로 입력
          </label>
          <input
            id="command"
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="예: 다음"
            autoComplete="off"
            className="min-h-[60px] w-full rounded-2xl border-[3px] border-ink bg-surface px-4 text-[19px] text-ink placeholder:text-ink-3"
          />
          <button type="submit" className="min-h-[60px] w-full rounded-2xl bg-ink text-xl font-bold text-white">
            보내기
          </button>
        </form>
      </main>

      <div className="flex flex-none flex-col gap-2 border-t-2 border-line bg-surface px-4 pb-[18px] pt-2.5">
        <p role="status" className="text-center text-base text-ink-2">
          {voiceStatus}
        </p>
        <button
          type="button"
          onClick={toggleListening}
          aria-pressed={listening}
          className={`flex min-h-[100px] w-full items-center justify-center gap-3.5 rounded-3xl border-4 border-accent text-[26px] font-black ${
            listening ? "bg-accent text-white" : "bg-surface text-accent"
          }`}
        >
          <MicIcon />
          <span>{listening ? "듣는 중 · 눌러서 끄기" : "눌러서 말하기"}</span>
        </button>
      </div>
    </div>
  );
}
