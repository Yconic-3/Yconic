"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import {
  courseLabel,
  courseOfExercise,
  DIFFICULTY_LABELS,
  EXERCISE_CATEGORY_LABELS,
  guideLevelFor,
  guideLevelLabel,
  guideTextOf,
  type AgentAction,
  type AgentChatResponse,
  type AgentTurn,
  type CourseId,
  type ExerciseSegment,
} from "@yconic/shared-types";
import { readSignedInAccount, signOut, type SignedInAccount } from "@/lib/auth";
import { createDefaultAgentClient, handleLocally, splitAgentActions } from "@/user/lib/agent";
import { createUserApi, errorMessage, type PublishedExercise } from "@/user/lib/api";
import { createCoursesApi } from "@/user/lib/courses-api";
import { eulReul, ieyo } from "@/user/lib/korean";
import { matchesFilter } from "@/user/lib/api/user-api";
import { parseIntent, type Intent } from "@/user/lib/intent";
import { goBack, goHome, INITIAL_NAV, navigate, type NavState, type View } from "@/user/lib/navigation";
import { formatDuration, SESSION_STATE_LABELS } from "@/user/lib/player";
import { startListening, type Listener, type ListenError } from "@/user/lib/recognition";
import { ShellContext, type PageCommandHandler, type PageInfo, type ShellApi, type ShellMode } from "@/user/lib/shell";
import {
  clampRate,
  getServerSpeechState,
  getSpeechState,
  pauseSpeaking,
  RATE_STEP,
  resumeSpeaking,
  setSpeechEnabled,
  speak,
  stopSpeaking,
  subscribeSpeech,
} from "@/user/lib/speech";
import { useExerciseSession } from "@/user/lib/use-exercise-session";
import { Brand, Button, Caution, Icon, ICONS, InfoBox, INPUT_CLASS, ListButton, MicIcon, Section } from "./ui";

/*
 * 사용자 화면 — 디자인 시안 D (소리벗 · 다크 고대비, 음성 패널 + 세로 본문)
 * 코드 순서가 곧 화면 순서다: 머리말 → 본문(제목, 방금 안내, 내용, 메뉴) → 음성 패널(마이크, 예시 말, 글 입력).
 * 스크린리더와 탭 키가 보이는 순서대로 움직이도록 CSS로 순서를 바꾸지 않는다.
 * - 넓은 화면(961px 이상): 왼쪽 본문 + 오른쪽 음성 패널 두 열
 * - 좁은 화면(960px 이하): 한 열. 마이크만 화면 맨 아래에 붙인다.
 *
 * 이 틀은 사용자 화면의 모든 주소가 함께 쓰는 레이아웃에 있어서, 주소가 바뀌어도 마이크와 대화가 이어진다.
 * 운동하기 홈(/)과 운동 화면(/exercises/[id])은 이 틀이 직접 그리고,
 * 나머지 페이지(내 계정, 내 강의, 내 콘텐츠 …)는 children으로 받아 본문 자리에 넣는다.
 */

const EXERCISE_PATH = /^\/exercises\/([^/]+)\/?$/;

export function exercisePath(id: string): string {
  return `/exercises/${encodeURIComponent(id)}`;
}

function exerciseIdFromPath(pathname: string | null): string | null {
  const m = pathname ? EXERCISE_PATH.exec(pathname) : null;
  return m ? decodeURIComponent(m[1]!) : null;
}

const GREETING = '안녕하세요. 어떤 운동을 할까요? 운동 이름을 말하거나, 콘텐츠를 올리려면 "콘텐츠 올리기"라고 말해 주세요.';
const SAFETY_MESSAGE =
  "운동을 멈췄습니다. 편한 자세로 쉬세요. 통증이나 어지럼, 숨찬 느낌이 계속되면 운동을 그만하고 주변 사람이나 의료진의 도움을 받으세요.";
const HELP_MESSAGE =
  "이렇게 말할 수 있습니다. 운동을 찾을 때는 하체 운동 찾아줘, 운동을 고를 때는 운동 이름과 시작. 운동 중에는 멈춰, 계속, 다음, 이전, 다시. 음성 안내 꺼, 음성 켜, 로그인, 콘텐츠 올리기, 홈, 이전 화면.";

const LISTEN_ERROR_TEXT: Record<ListenError, string> = {
  unsupported: "이 브라우저는 음성 인식을 지원하지 않아요. 아래 칸에 글로 입력해 주세요.",
  denied: "마이크 사용이 허용되지 않았어요. 브라우저 설정에서 허용하거나 글로 입력해 주세요.",
  failed: "음성 인식이 잠시 끊겼어요. 마이크 버튼을 다시 눌러 주세요.",
};

/** 에이전트에게 함께 보내는 최근 대화 수 */
const LOG_LIMIT = 8;

/** 이 브라우저에만 기억하는 설정 (음성 안내 켬·끔, 말 속도) */
const PREFS_KEY = "yconic.voice-prefs";

interface Message {
  id: number;
  who: "bot" | "me";
  text: string;
}

/** 로그인해야 쓸 수 있는 주소 */
const SUPPLY_PREFIX = "/my";

function readPrefs(): { tts: boolean; rate: number } {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    const v = raw ? (JSON.parse(raw) as { tts?: unknown; rate?: unknown }) : {};
    return { tts: v.tts !== false, rate: typeof v.rate === "number" ? clampRate(v.rate) : 1 };
  } catch {
    return { tts: true, rate: 1 };
  }
}

function writePrefs(prefs: { tts: boolean; rate: number }) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 저장하지 못해도 이번 화면에서는 그대로 쓴다
  }
}

export function AssistantApp({ children }: { children?: ReactNode }) {
  const api = useMemo(() => createUserApi(), []);
  const agent = useMemo(() => createDefaultAgentClient(), []);
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const routeExerciseId = exerciseIdFromPath(pathname);
  /** 이 틀이 직접 그리는 주소 (운동하기 홈, 운동 화면) */
  const shellRoute = pathname === "/" || routeExerciseId !== null;
  const [account, setAccount] = useState<SignedInAccount | null>(null);
  const speech = useSyncExternalStore(subscribeSpeech, getSpeechState, getServerSpeechState);

  // 로그인 상태는 브라우저 저장소에 있으므로 화면이 뜬 뒤에 읽는다. 다른 화면에서 돌아오면 다시 읽는다.
  const refreshAccount = useCallback(() => setAccount(readSignedInAccount()), []);
  useEffect(refreshAccount, [pathname, refreshAccount]);

  // 내 강의: 로그인하면 불러온다. 로그인하지 않았으면 null (모든 동작을 자세하게 안내)
  const coursesApi = useMemo(() => createCoursesApi(), []);
  const [learned, setLearned] = useState<CourseId[] | null>(null);
  const accountId = account?.id ?? null;
  useEffect(() => {
    if (!accountId) {
      setLearned(null);
      return;
    }
    let cancelled = false;
    coursesApi
      .get()
      .then((ids) => !cancelled && setLearned(ids))
      .catch(() => !cancelled && setLearned([]));
    return () => {
      cancelled = true;
    };
  }, [accountId, coursesApi]);
  const setLearnedCourses = useCallback(
    async (ids: CourseId[]) => {
      setLearned(await coursesApi.set(ids));
    },
    [coursesApi],
  );
  /** 이 운동을 짧게 안내할지 자세하게 안내할지 */
  const levelOf = useCallback((e: Pick<PublishedExercise, "category" | "tags">) => guideLevelFor(e, accountId ? (learned ?? []) : null), [accountId, learned]);

  const [exercises, setExercises] = useState<PublishedExercise[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nav, setNav] = useState<NavState>(INITIAL_NAV);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [log, setLog] = useState<Message[]>([{ id: 0, who: "bot", text: GREETING }]);
  const [lastSaid, setLastSaid] = useState(GREETING);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  /** 스크린리더에 알릴 말 (음성 안내를 껐을 때와 설정이 바뀔 때) */
  const [announce, setAnnounce] = useState("");
  const [rate, setRate] = useState(1);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("위의 큰 버튼을 누르고 말하세요.");
  const [command, setCommand] = useState("");
  /** AI 에이전트의 답을 기다리는 중 */
  const [thinking, setThinking] = useState(false);
  /** children 페이지가 알려 준 제목·예시 말 */
  const [page, setPage] = useState<PageInfo | null>(null);

  const rateRef = useRef(rate);
  rateRef.current = rate;
  const speechEnabledRef = useRef(speech.enabled);
  speechEnabledRef.current = speech.enabled;
  const pageCommandsRef = useRef<PageCommandHandler | null>(null);
  const listenerRef = useRef<Listener | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const autoplayRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const firstViewRef = useRef(true);
  const messageSeq = useRef(1);
  /** 말을 받을 때마다 올린다. 늦게 온 에이전트 답이 그 뒤의 말을 덮지 않게 한다 */
  const commandSeqRef = useRef(0);
  /** 에이전트가 이미 말했으면 운동 화면을 열 때의 "준비할게요" 안내를 건너뛴다 */
  const quietIntroRef = useRef(false);
  const logRef = useRef(log);
  logRef.current = log;

  // 지난번 음성 설정을 불러온다
  useEffect(() => {
    const prefs = readPrefs();
    setSpeechEnabled(prefs.tts);
    rateRef.current = prefs.rate;
    setRate(prefs.rate);
  }, []);

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

  // 운동 화면은 주소(/exercises/[id])가 정하고, 운동하기 홈 안의 목록 거르기는 nav가 기억한다.
  const view: View = useMemo(
    () => (routeExerciseId ? { name: "exercise", exerciseId: routeExerciseId } : nav.current),
    [routeExerciseId, nav],
  );
  const mode: ShellMode = pathname.startsWith(SUPPLY_PREFIX) ? "supply" : (page?.mode ?? "consume");

  // 화면이 바뀌면 맨 위로 올리고 제목으로 초점을 옮겨, 스크린리더가 새 화면의 처음부터 읽게 한다.
  const viewKey = shellRoute ? JSON.stringify(view) : pathname;
  useEffect(() => {
    if (firstViewRef.current) {
      firstViewRef.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [viewKey]);

  const exercise = useMemo(
    () => (routeExerciseId ? (exercises?.find((e) => e.id === routeExerciseId) ?? null) : null),
    [exercises, routeExerciseId],
  );
  /** 주소의 운동이 공개 목록에 없을 때 (공개 중단, 잘못된 주소) */
  const exerciseMissing = routeExerciseId !== null && exercises !== null && !exercise;

  /**
   * '방금 안내'에 남기고 소리 내어 읽는다. 끝까지 읽으면 true.
   * 음성 안내를 껐으면 스크린리더가 읽도록 알림 영역에도 넣는다 (켜져 있으면 소리와 겹치지 않게 넣지 않는다).
   */
  const say = useCallback(
    (text: string, audioUrl?: string | null) => {
      addMessage("bot", text);
      setLastSaid(text);
      if (!speechEnabledRef.current) setAnnounce(text);
      return speak(text, { rate: rateRef.current, audioUrl });
    },
    [addMessage],
  );

  const exerciseLevel = exercise ? levelOf(exercise) : "detailed";
  const guideOf = useCallback((s: ExerciseSegment) => guideTextOf(s, exerciseLevel), [exerciseLevel]);
  const session = useExerciseSession(exercise, videoRef, say, guideOf);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const levelRef = useRef(exerciseLevel);
  levelRef.current = exerciseLevel;

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
    const quiet = quietIntroRef.current;
    quietIntroRef.current = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (quiet) {
        if (autoplay) sessionRef.current.start();
        return;
      }
      // 왜 짧게/자세하게 안내하는지 먼저 알린다 (내 강의)
      const course = courseOfExercise(exercise);
      const why =
        levelRef.current === "concise" && course
          ? `${courseLabel(course)} 강의를 들으셨으니 배운 용어로 짧게 안내할게요.`
          : "처음 하는 동작이라 자세와 방향까지 자세히 안내할게요.";
      void say(`${eulReul(exercise.title)} 준비할게요. ${why}${autoplay ? " 바로 시작합니다." : ' "시작"이라고 말하면 1단계부터 안내합니다.'}`).then((finished) => {
        // 안내를 다 읽기 전에 사용자가 다른 말을 했으면 바로 시작하지 않는다
        if (!cancelled && autoplay && finished) sessionRef.current.start();
      });
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

  const listLabel = useCallback((v: Extract<View, { name: "list" }>) => (v.category ? EXERCISE_CATEGORY_LABELS[v.category] : (v.keyword ?? "전체")), []);

  const viewName = useCallback(
    (v: View): string => {
      if (v.name === "home") return "운동하기 홈";
      if (v.name === "list") return `${listLabel(v)} 운동 목록`;
      return `${exercises?.find((e) => e.id === v.exerciseId)?.title ?? "운동"} 안내`;
    },
    [exercises, listLabel],
  );

  const listFor = useCallback(
    (v: View): PublishedExercise[] => {
      const all = exercises ?? [];
      if (v.name !== "list") return all;
      return all.filter((e) => matchesFilter(e, { category: v.category ?? undefined, keyword: v.keyword ?? undefined }));
    },
    [exercises],
  );

  /** 운동 화면(/exercises/[id])으로 간다. 마이크와 대화는 그대로 이어진다. */
  const openExercise = useCallback(
    (id: string, autoplay: boolean) => {
      stopSpeaking();
      autoplayRef.current = autoplay;
      router.push(exercisePath(id));
    },
    [router],
  );

  /** 다른 주소로 가고, message가 있으면 읽는다 */
  const goTo = useCallback(
    (path: string, message?: string) => {
      stopSpeaking();
      if (path !== pathname) router.push(path);
      if (message) void say(message);
    },
    [pathname, router, say],
  );

  /** quiet면 화면만 옮기고 말하지 않는다 (에이전트가 대신 말할 때) */
  const handleHome = useCallback(
    (quiet = false) => {
      stopSpeaking();
      if (mode === "supply") {
        if (pathname !== "/my/contents") router.push("/my/contents");
        if (!quiet) void say("내 콘텐츠 화면입니다. 새 콘텐츠를 만들거나 올린 콘텐츠의 상태를 확인할 수 있습니다.");
        return;
      }
      setNav(goHome());
      if (pathname !== "/") router.push("/");
      if (!quiet) void say("운동하기 홈입니다. 어떤 운동을 할까요?");
    },
    [mode, pathname, router, say],
  );

  const handleBack = useCallback(
    (quiet = false) => {
      stopSpeaking();
      if (!shellRoute || routeExerciseId) {
        // 페이지 주소에서는 브라우저의 이전 화면으로 간다. 운동 화면에서 돌아가면 거르던 목록이 그대로 나온다.
        router.back();
        if (!quiet) void say("이전 화면입니다.");
        return;
      }
      const next = goBack(nav);
      setNav(next);
      if (!quiet) void say(`이전 화면, ${viewName(next.current)}입니다.`);
    },
    [nav, routeExerciseId, router, say, shellRoute, viewName],
  );

  const handleLogout = useCallback(() => {
    if (!readSignedInAccount()) {
      void say("지금은 로그인되어 있지 않습니다.");
      return;
    }
    signOut();
    setAccount(null);
    if (pathname.startsWith(SUPPLY_PREFIX) || pathname === "/courses") router.push("/");
    void say("로그아웃했습니다. 운동 찾기와 안내 듣기는 계속 쓸 수 있습니다.");
  }, [pathname, router, say]);

  const setTts = useCallback(
    (on: boolean) => {
      if (on === speechEnabledRef.current) {
        void say(on ? "음성 안내가 이미 켜져 있습니다." : "음성 안내가 이미 꺼져 있습니다.");
        return;
      }
      setSpeechEnabled(on);
      speechEnabledRef.current = on;
      writePrefs({ tts: on, rate: rateRef.current });
      setAnnounce(on ? "음성 안내를 켰습니다." : "음성 안내를 껐습니다.");
      if (on) void say("음성 안내를 켰습니다.");
      else setLastSaid("음성 안내를 껐습니다. 이제 안내는 여기에 글로만 표시됩니다.");
    },
    [say],
  );

  const toggleTtsPause = useCallback(() => {
    const s = getSpeechState();
    if (s.paused) {
      resumeSpeaking();
      setAnnounce("음성을 이어서 읽습니다.");
    } else if (s.speaking) {
      pauseSpeaking();
      setAnnounce("음성을 잠시 멈췄습니다.");
    }
  }, []);

  const adjustRate = useCallback((delta: number) => {
    const next = clampRate(rateRef.current + delta);
    rateRef.current = next;
    setRate(next);
    writePrefs({ tts: speechEnabledRef.current, rate: next });
    return next;
  }, []);

  const changeRate = useCallback(
    (delta: number) => {
      const next = adjustRate(delta);
      void say(`말하기 속도 ${next.toFixed(2)}배입니다.`);
    },
    [adjustRate, say],
  );

  const showAllExercises = useCallback(() => {
    stopSpeaking();
    setNav((n) => navigate(n, { name: "list", category: null, keyword: null }));
    if (pathname !== "/") router.push("/");
    void say(`운동 목록입니다. 전체 ${exercises?.length ?? 0}개입니다. 이름을 말하면 시작할게요.`);
  }, [exercises, pathname, router, say]);

  /** 규칙 기반 해석(intent.ts)으로 처리한다. 에이전트가 꺼져 있거나 짧은 조작·앱 명령일 때 */
  const runIntent = useCallback(
    (intent: Intent) => {
      const all = exercises ?? [];
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
        case "ACCOUNT":
          goTo("/account", readSignedInAccount() ? "내 계정 화면입니다." : "로그인 화면입니다. 이메일과 비밀번호를 넣거나 체험용 계정을 골라 주세요.");
          return;
        case "LOGOUT":
          handleLogout();
          return;
        case "TTS_ON":
          setTts(true);
          return;
        case "TTS_OFF":
          setTts(false);
          return;
        case "TTS_PAUSE":
          if (!getSpeechState().paused) toggleTtsPause();
          return;
        case "TTS_RESUME":
          if (getSpeechState().paused) toggleTtsPause();
          return;
        case "CONSUME":
          setNav(goHome());
          goTo("/", "운동하기 홈입니다. 어떤 운동을 할까요?");
          return;
        case "SUPPLY":
          goTo("/my/contents", "콘텐츠 올리기 화면입니다. 새 콘텐츠를 만들려면 새 콘텐츠라고 말해 주세요.");
          return;
        case "NEW_CONTENT":
          goTo("/my/contents/new", "새 콘텐츠 만들기입니다. 운동 영상 파일을 고르고 분석 시작이라고 말해 주세요.");
          return;
        case "COURSES": {
          if (!intent.courseId || !readSignedInAccount()) {
            goTo("/courses", "내 강의 화면입니다. 강사에게 배운 강의를 고르면 그 동작은 짧게 안내합니다.");
            return;
          }
          const id = intent.courseId;
          const current = learned ?? [];
          const next = intent.learned ? [...new Set([...current, id])] : current.filter((c) => c !== id);
          void setLearnedCourses(next)
            .then(() =>
              say(
                intent.learned
                  ? `${courseLabel(id)} 강의를 수강한 것으로 기록했어요. 그 동작들은 짧게 안내할게요.`
                  : `${courseLabel(id)} 강의를 수강 목록에서 뺐어요. 그 동작들은 자세하게 안내할게요.`,
              ),
            )
            .catch((e: unknown) => say(`내 강의를 저장하지 못했어요. ${e instanceof Error ? e.message : ""}`));
          return;
        }
        case "LIST": {
          const target: View = { name: "list", category: intent.category, keyword: intent.keyword };
          const found = all.filter((e) => matchesFilter(e, { category: intent.category ?? undefined, keyword: intent.keyword ?? undefined }));
          stopSpeaking();
          setNav((n) => navigate(n, target));
          if (pathname !== "/") router.push("/");
          const label = intent.category ? EXERCISE_CATEGORY_LABELS[intent.category] : (intent.keyword ?? "");
          void say(
            found.length
              ? `${label ? `${label} 운동은 ` : "할 수 있는 운동은 "}${found.map((e) => e.title).join(", ")}이에요. 이름을 말하면 시작할게요.`
              : `${label} 운동을 찾지 못했어요. "홈"이라고 말하면 전체 목록으로 돌아갑니다.`,
          );
          return;
        }
        case "OPEN":
          if (exercise?.id === intent.exerciseId) {
            if (intent.autoplay) s.start();
            else void say(`${ieyo(exercise.title)}. "시작"이라고 말하면 안내를 시작합니다.`);
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
          void say(
            mode === "supply"
              ? "잘 못 들었어요. 새 콘텐츠, 분석 시작, 미리 듣기, 검수 요청, 운동하기 중에서 말씀해 주세요."
              : "잘 못 들었어요. 도움말이라고 말하면 쓸 수 있는 말을 알려 드릴게요.",
          );
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
    [changeRate, exercise, exercises, goTo, handleBack, handleHome, handleLogout, learned, mode, openExercise, pathname, router, say, setLearnedCourses, setTts, toggleTtsPause],
  );

  /** 에이전트가 돌려준 할 일 하나를 말 없이 실행한다. 말은 에이전트의 답이 대신한다 */
  const runAgentAction = useCallback(
    (action: AgentAction) => {
      const s = sessionRef.current;
      switch (action.type) {
        case "SHOW_LIST":
          setNav((n) => navigate(n, { name: "list", category: action.category, keyword: action.keyword }));
          if (pathname !== "/") router.push("/");
          return;
        case "OPEN_EXERCISE":
          if (exercise?.id === action.exerciseId) {
            if (action.autoplay) s.start();
            return;
          }
          quietIntroRef.current = !action.autoplay;
          openExercise(action.exerciseId, action.autoplay);
          return;
        case "SPEECH_RATE":
          adjustRate(action.direction === "SLOWER" ? -RATE_STEP : RATE_STEP);
          return;
        case "NAVIGATE":
          if (action.destination === "HOME") handleHome(true);
          else handleBack(true);
          return;
        case "PLAYBACK":
          switch (action.command) {
            case "STOP":
              s.stop();
              return;
            case "PAUSE":
              stopSpeaking();
              s.pause();
              return;
            case "START":
              s.start();
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
      }
    },
    [adjustRate, exercise, handleBack, handleHome, openExercise, pathname, router],
  );

  /** 에이전트의 답: 화면 이동·멈춤은 바로, 답을 읽고, 안내를 시작하는 조작은 답을 다 읽은 뒤에 한다 */
  const runAgentResponse = useCallback(
    async (response: AgentChatResponse, seq: number) => {
      const { before, after } = splitAgentActions(response.actions);
      before.forEach(runAgentAction);
      const stopped = response.actions.some((a) => a.type === "PLAYBACK" && a.command === "STOP");
      const reply = response.reply || (stopped ? SAFETY_MESSAGE : "");
      if (reply) await say(reply);
      // 읽는 사이에 사용자가 다른 말을 했으면 미뤄 둔 조작은 하지 않는다
      if (seq !== commandSeqRef.current) return;
      after.forEach(runAgentAction);
    },
    [runAgentAction, say],
  );

  const handleCommand = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const seq = ++commandSeqRef.current;
      // 지금 말을 넣기 전의 대화를 에이전트에게 함께 보낸다
      const history: AgentTurn[] = logRef.current.map((m) => ({ role: m.who === "me" ? "user" : "assistant", text: m.text }));
      addMessage("me", text);
      setLastHeard(text);
      const intent = parseIntent(text, exercises ?? []);

      // 위험 신호는 어느 화면에서든 가장 먼저 처리한다
      if (intent.type === "SAFETY") {
        setThinking(false);
        runIntent(intent);
        return;
      }
      // 페이지에서만 쓰는 말 (예: 분석 시작, 검수 요청)
      if (pageCommandsRef.current?.(text)) {
        setThinking(false);
        return;
      }
      // 콘텐츠 올리기 화면에서는 운동 에이전트를 쓰지 않는다
      if (mode === "supply" || handleLocally(intent, text, exercise !== null)) {
        setThinking(false);
        runIntent(intent);
        return;
      }

      setThinking(true);
      const s = sessionRef.current;
      void agent
        .chat({
          message: text,
          history,
          context: {
            screen: shellRoute ? view.name : "home",
            exerciseId: view.name === "exercise" ? view.exerciseId : null,
            sessionState: exercise ? s.state : null,
            segmentIndex: exercise ? s.segmentIndex : null,
          },
        })
        .then((response) => {
          if (seq !== commandSeqRef.current) return;
          setThinking(false);
          // 에이전트를 못 쓰면 규칙 기반 해석으로 처리한다
          if (response) void runAgentResponse(response, seq);
          else runIntent(intent);
        });
    },
    [addMessage, agent, exercise, exercises, mode, runAgentResponse, runIntent, shellRoute, view],
  );

  const handleCommandRef = useRef(handleCommand);
  handleCommandRef.current = handleCommand;

  const toggleListening = useCallback(() => {
    if (listenerRef.current) {
      listenerRef.current.stop();
      listenerRef.current = null;
      setListening(false);
      setVoiceStatus("듣기를 껐어요.");
      setAnnounce("듣기를 껐습니다.");
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
      setAnnounce("듣기를 켰습니다.");
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

  const shellApi = useMemo<ShellApi>(
    () => ({
      account,
      refreshAccount,
      learnedCourses: accountId ? learned : null,
      setLearnedCourses,
      say,
      setPage,
      setPageCommands: (handler) => {
        pageCommandsRef.current = handler;
      },
    }),
    [account, accountId, learned, refreshAccount, say, setLearnedCourses],
  );

  // ── 화면에 쓸 값 ──
  const list = listFor(view);
  const currentSegment = exercise?.segments[session.segmentIndex] ?? null;
  const isHomeView = pathname === "/" && view.name === "home";

  const headline = !shellRoute
    ? (page?.title ?? "")
    : routeExerciseId
      ? (exercise?.title ?? (exerciseMissing ? "운동을 찾을 수 없어요" : "운동을 불러오는 중이에요"))
      : view.name === "list"
        ? `${listLabel(view)} 운동 목록`
        : "어떤 운동을 할까요?";
  const modeLabel = `${mode === "supply" ? "콘텐츠 올리기" : "운동하기"} · ${account ? `${account.name}님` : "로그인 전"}`;
  const pageTitle = headline ? `${headline} — 소리벗` : "소리벗 — 말로 찾고, 듣고 따라 하는 운동";

  const chips =
    page?.chips ??
    (exercise ? ["시작", "다음", "다시", "멈춰"] : mode === "supply" ? ["새 콘텐츠", "운동하기"] : ["하체 운동 찾아줘", "스쿼트 시작", account ? "내 강의" : "로그인"]);

  const menu: { label: string; sub: string; icon: string; path: string; strong?: boolean; go(): void }[] =
    mode === "supply"
      ? [
          { label: "내 콘텐츠", sub: "올린 콘텐츠의 검수·공개 상태 보기", icon: ICONS.video, path: "/my/contents", go: () => runIntent({ type: "SUPPLY" }) },
          { label: "새 콘텐츠 만들기", sub: "영상을 올리고 음성 안내 초안 만들기", icon: ICONS.plus, path: "/my/contents/new", go: () => runIntent({ type: "NEW_CONTENT" }) },
          { label: "운동하기로 바꾸기", sub: "운동을 찾고 안내를 듣는 화면", icon: ICONS.swap, path: "", strong: true, go: () => runIntent({ type: "CONSUME" }) },
        ]
      : [
          {
            label: account ? "내 계정" : "로그인",
            sub: account ? `${account.name}님 · 로그아웃은 여기서` : "로그인하면 내 강의와 콘텐츠 올리기를 쓸 수 있습니다",
            icon: account ? ICONS.user : ICONS.login,
            path: "/account",
            go: () => runIntent({ type: "ACCOUNT" }),
          },
          { label: "운동 목록 열기", sub: `전체 운동 ${exercises?.length ?? 0}개`, icon: ICONS.list, path: "", go: showAllExercises },
          {
            label: "내 강의 바꾸기",
            sub: account ? `현재: ${learned?.length ? learned.map(courseLabel).join(", ") : "등록 없음"}` : "로그인 필요",
            icon: ICONS.book,
            path: "/courses",
            go: () => runIntent({ type: "COURSES", courseId: null, learned: true }),
          },
          { label: "콘텐츠 올리기로 바꾸기", sub: "운동 영상을 올리는 분을 위한 화면", icon: ICONS.swap, path: "", strong: true, go: () => runIntent({ type: "SUPPLY" }) },
        ];

  const ttsStatus = speech.paused ? "읽기를 잠시 멈췄습니다." : `읽는 중: ${lastSaid.length > 60 ? `${lastSaid.slice(0, 60)}…` : lastSaid}`;
  const ttsPauseLabel = speech.paused ? "이어서 읽기" : "읽기 잠시 멈춤";
  const showTtsControl = speech.speaking || speech.paused;

  return (
    <ShellContext.Provider value={shellApi}>
      <div className="flex min-h-dvh flex-col">
        <title>{pageTitle}</title>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-3 focus:!text-bg">
          본문으로 건너뛰기
        </a>
        <a href="#voice" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-3 focus:!text-bg">
          마이크로 건너뛰기
        </a>
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>

        {/* ── 머리말 ── */}
        <header className="border-b-2 border-line">
          <div className="mx-auto flex max-w-[1180px] flex-nowrap items-center gap-x-6 gap-y-3 px-4 py-4 max-[960px]:flex-wrap">
            <Brand />
            <nav aria-label="화면 종류" className="ml-auto flex flex-nowrap items-center gap-2 max-[960px]:ml-0 max-[960px]:w-full max-[960px]:flex-wrap">
              <HeaderTab current={mode === "consume"} icon={ICONS.exercise} onClick={() => runIntent({ type: "CONSUME" })}>
                운동하기
              </HeaderTab>
              <HeaderTab current={mode === "supply"} icon={ICONS.upload} onClick={() => runIntent({ type: "SUPPLY" })}>
                콘텐츠 올리기
              </HeaderTab>
              <button
                type="button"
                onClick={() => (account ? handleLogout() : runIntent({ type: "ACCOUNT" }))}
                className="flex min-h-[56px] items-center gap-2.5 whitespace-nowrap rounded-[14px] border-[3px] border-info bg-bg px-5 font-bold text-info hover:bg-info-tint active:bg-info active:text-bg max-[960px]:flex-[1_1_150px] max-[960px]:justify-center"
              >
                <Icon d={account ? ICONS.logout : ICONS.login} />
                <span>{account ? "로그아웃" : "로그인"}</span>
              </button>
              <button
                type="button"
                onClick={() => setTts(!speech.enabled)}
                aria-pressed={speech.enabled}
                className="flex min-h-[56px] items-center gap-2.5 whitespace-nowrap px-2.5 font-bold text-info underline decoration-2 underline-offset-[5px] hover:text-info-light hover:decoration-[3px] max-[960px]:flex-[1_1_150px] max-[960px]:justify-center"
              >
                <Icon d={speech.enabled ? ICONS.speaker : ICONS.speakerOff} />
                <span>음성 안내: {speech.enabled ? "켜짐" : "꺼짐"}</span>
              </button>
            </nav>
          </div>
        </header>

        <div className="mx-auto box-border flex w-full max-w-[1180px] flex-1 items-start gap-12 px-4 pb-[72px] pt-11 max-[960px]:flex-col max-[960px]:items-stretch max-[960px]:gap-11 max-[960px]:pb-10 max-[960px]:pt-7">
          {/* ── 본문 ── */}
          <main id="main" className="flex min-w-0 flex-[999_1_520px] flex-col gap-[60px] max-[960px]:flex-none max-[960px]:gap-12">
            <div className="flex flex-col gap-1">
              <span className="text-[17px] font-bold text-accent">{modeLabel}</span>
              <h1 ref={headingRef} tabIndex={-1} className="m-0 text-[44px] font-extrabold leading-tight tracking-[-0.5px] max-[960px]:text-[30px] max-[420px]:text-[26px]">
                {headline}
              </h1>
            </div>

            <section aria-labelledby="last-said-title" className="flex flex-col gap-3.5">
              <h2 id="last-said-title" className="m-0 text-[17px] font-bold text-ink-3">
                방금 안내
              </h2>
              <p className="m-0 whitespace-pre-line rounded-2xl border-2 border-accent bg-panel p-5 text-[22px] leading-[1.55]">{lastSaid}</p>
              <p className="m-0 text-[17px] text-ink-3">내가 한 말: {lastHeard ?? "아직 없음"}</p>
              <button
                type="button"
                onClick={() => void speak(lastSaid, { rate: rateRef.current })}
                className="self-start text-[18px] font-bold text-info underline decoration-2 underline-offset-[5px] hover:text-info-light"
              >
                방금 안내 다시 듣기
              </button>
            </section>

            {!isHomeView && (
              <nav aria-label="화면 이동" className="flex flex-col gap-3.5">
                <Button tone="inverse" size="lg" icon={ICONS.back} className="!justify-start" onClick={() => handleBack()}>
                  이전 화면으로
                </Button>
                <Button tone="line" size="lg" icon={ICONS.home} className="!justify-start" onClick={() => handleHome()}>
                  {mode === "supply" ? "내 콘텐츠로" : "운동하기 홈으로"}
                </Button>
              </nav>
            )}

            {/* ── 운동 화면 ── */}
            {routeExerciseId && exercise && (
              <>
                <section aria-label={`${exercise.title} 영상`} className="flex flex-col gap-3">
                  {videoUrl ? (
                    // 영상의 소리와 음성 안내가 함께 나온다. 자막 파일은 아직 없다.
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="aspect-video w-full rounded-[20px] border-2 border-line bg-black"
                      aria-label={`${exercise.title} 영상`}
                    />
                  ) : (
                    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-line bg-panel px-6 text-center">
                      <p className="m-0 text-[22px] font-bold">아직 올라온 영상 파일이 없어요</p>
                      <p className="m-0 text-[18px] text-ink-2">시작을 누르면 영상 없이 시간에 맞춰 단계 안내를 들려 드려요.</p>
                    </div>
                  )}
                  <p className="m-0 text-[18px] text-ink-2">
                    {EXERCISE_CATEGORY_LABELS[exercise.category]} · {DIFFICULTY_LABELS[exercise.difficulty]} · {formatDuration(exercise.video.durationSec)}
                    {exercise.summary ? ` · ${exercise.summary}` : ""}
                  </p>
                </section>

                <section aria-labelledby="control-title" className="flex flex-col gap-4">
                  <h2 id="control-title" className="m-0 text-[26px] font-extrabold">
                    {exercise.title} · {session.segmentIndex + 1}/{exercise.segments.length}단계 {currentSegment?.title ?? ""}
                  </h2>
                  <p className="m-0 text-[18px] text-ink-2">
                    {guideLevelLabel(exerciseLevel)} 안내 · 지금 상태: {session.playing ? "안내 중" : SESSION_STATE_LABELS[session.state]}
                  </p>
                  <Button tone="primary" size="xl" icon={session.playing ? ICONS.pause : ICONS.play} onClick={togglePlay} className="!min-h-[84px] !text-[28px]">
                    {session.playing ? "멈춤" : session.started && session.state === "PAUSED" ? "계속" : "시작"}
                  </Button>
                  <Button size="lg" icon={ICONS.next} onClick={session.next}>
                    다음 단계
                  </Button>
                  <Button size="lg" icon={ICONS.repeat} onClick={session.repeat}>
                    다시 듣기
                  </Button>
                  <Button size="lg" icon={ICONS.prev} onClick={session.previous}>
                    이전 단계
                  </Button>
                  {exercise.precautions.length > 0 && <Caution label="주의할 자세">{exercise.precautions.join(" ")}</Caution>}
                </section>

                <Section id="steps-title" title="전체 단계">
                  <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
                    {exercise.segments.map((seg, i) => {
                      const current = i === session.segmentIndex;
                      return (
                        <li key={seg.id}>
                          <ListButton
                            icon={current ? ICONS.speaker : ICONS.dot}
                            title={`${i + 1}단계. ${seg.title}`}
                            mark={current ? " (지금)" : ""}
                            sub={guideOf(seg) || "이 단계에는 음성 안내가 없어요."}
                            current={current}
                            currentKind="step"
                            onClick={() => session.goToSegment(i)}
                          />
                        </li>
                      );
                    })}
                  </ol>
                </Section>
              </>
            )}

            {exerciseMissing && (
              <Section id="missing-title" title="운동을 찾을 수 없어요">
                <p className="m-0 text-ink-2">공개가 끝났거나 주소가 잘못되었어요. 운동 목록에서 다시 골라 주세요.</p>
              </Section>
            )}

            {/* ── 운동하기 홈 ── */}
            {pathname === "/" && (
              <>
                {!account && (
                  <InfoBox>
                    <h2 className="m-0 text-[24px] font-extrabold">로그인 전입니다</h2>
                    <p className="m-0 text-[18px] text-ink-2">
                      운동 찾기와 안내 듣기는 지금도 쓸 수 있습니다. 로그인하면 배운 강의에 맞춘 간결한 안내와 콘텐츠 올리기를 쓸 수 있습니다.
                    </p>
                    <Button tone="info" size="lg" icon={ICONS.login} onClick={() => runIntent({ type: "ACCOUNT" })} className="!min-h-[72px] !text-[23px]">
                      로그인하기
                    </Button>
                  </InfoBox>
                )}

                <Section id="list-title" title={view.name === "list" ? `${listLabel(view)} 운동` : "할 수 있는 운동"}>
                  {loadError ? (
                    <>
                      <p role="alert" className="m-0 text-ink-2">
                        운동 목록을 불러오지 못했어요. {loadError}
                      </p>
                      <Button tone="soft" onClick={() => void loadExercises()}>
                        다시 시도
                      </Button>
                    </>
                  ) : exercises === null ? (
                    <p className="m-0 text-ink-2">운동 목록을 불러오는 중이에요.</p>
                  ) : list.length === 0 ? (
                    <p className="m-0 text-ink-2">해당하는 운동이 없어요.</p>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
                      {list.map((e) => (
                        <li key={e.id}>
                          <ListButton
                            icon={ICONS.exercise}
                            title={e.title}
                            sub={`${EXERCISE_CATEGORY_LABELS[e.category]}, ${formatDuration(e.video.durationSec)}, ${DIFFICULTY_LABELS[e.difficulty]}, ${guideLevelLabel(levelOf(e))} 안내`}
                            onClick={() => {
                              addMessage("me", `${e.title} 시작`);
                              setLastHeard(`${e.title} 시작`);
                              openExercise(e.id, true);
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </>
            )}

            {/* ── 다른 페이지 (내 계정, 내 강의, 내 콘텐츠 …) ── */}
            {!shellRoute && children}

            <Section id="menu-title" title="메뉴">
              {menu.map((m) => {
                const current = m.path !== "" && pathname === m.path;
                return (
                  <ListButton
                    key={m.label}
                    icon={m.icon}
                    title={m.label}
                    mark={current ? " (지금 화면)" : ""}
                    sub={m.sub}
                    current={current}
                    onClick={m.go}
                  />
                );
              })}
              {account?.adminRole && (
                <Link
                  href="/admin"
                  className="flex min-h-[72px] items-center gap-3 rounded-2xl border-[3px] border-info bg-bg px-[18px] text-[22px] font-bold !text-info no-underline hover:bg-info-tint"
                >
                  <Icon d={ICONS.shield} size={26} />
                  <span>관리자 페이지 (검수·승인)</span>
                </Link>
              )}
            </Section>
          </main>

          {/* ── 음성 패널 ── */}
          <aside
            id="voice"
            aria-labelledby="voice-title"
            className="flex min-w-0 flex-[1_1_340px] flex-col gap-10 rounded-3xl border-2 border-line bg-panel p-7 max-[960px]:flex-none max-[960px]:gap-11 max-[960px]:border-0 max-[960px]:bg-transparent max-[960px]:p-0"
          >
            <div className="flex flex-col gap-4 max-[960px]:fixed max-[960px]:inset-x-0 max-[960px]:bottom-0 max-[960px]:z-10 max-[960px]:gap-2 max-[960px]:border-t-2 max-[960px]:border-line max-[960px]:bg-panel max-[960px]:px-4 max-[960px]:pb-4 max-[960px]:pt-2.5">
              <h2 id="voice-title" className="m-0 text-[22px] font-extrabold max-[960px]:sr-only">
                말로 하기
              </h2>
              {showTtsControl && (
                <button
                  type="button"
                  onClick={toggleTtsPause}
                  aria-pressed={speech.paused}
                  className="hidden min-h-[60px] w-full items-center justify-center gap-2.5 rounded-2xl border-[3px] border-info bg-bg text-[21px] font-extrabold text-info max-[960px]:flex"
                >
                  <Icon d={speech.paused ? ICONS.play : ICONS.pause} size={22} />
                  <span>{ttsPauseLabel}</span>
                </button>
              )}
              <button
                type="button"
                onClick={toggleListening}
                aria-pressed={listening}
                className={`flex min-h-[128px] w-full items-center justify-center gap-4 rounded-3xl border-4 border-accent text-[28px] font-extrabold max-[960px]:min-h-[96px] max-[960px]:text-[24px] ${
                  listening ? "bg-accent text-bg hover:bg-accent-hover" : "bg-bg text-accent hover:bg-accent-tint"
                }`}
              >
                <MicIcon />
                <span>{listening ? "듣는 중 · 눌러서 끄기" : "눌러서 말하기"}</span>
              </button>
              <p role="status" className="m-0 text-[17px] text-ink-2 max-[960px]:text-center max-[960px]:text-[16px]">
                {thinking ? "답을 생각하고 있어요…" : voiceStatus}
              </p>
            </div>

            <section aria-labelledby="say-title" className="flex flex-col gap-3.5">
              <h3 id="say-title" className="m-0 text-[19px] font-extrabold">
                이렇게 말해 보세요
              </h3>
              {chips.map((c) => (
                <Button key={c} tone="soft" icon={ICONS.chat} className="!justify-start" onClick={() => handleCommand(c)}>
                  “{c}”
                </Button>
              ))}
            </section>

            <section aria-labelledby="rate-title" className="flex flex-col gap-3.5">
              <h3 id="rate-title" className="m-0 text-[19px] font-extrabold">
                말 속도 {rate.toFixed(2)}배
              </h3>
              <div className="flex gap-3">
                <Button tone="soft" onClick={() => changeRate(-RATE_STEP)}>
                  느리게
                </Button>
                <Button tone="soft" onClick={() => changeRate(RATE_STEP)}>
                  빠르게
                </Button>
              </div>
            </section>

            <form onSubmit={submitCommand} className="flex flex-col gap-3.5">
              <label htmlFor="command" className="text-[19px] font-extrabold">
                말 대신 글로 입력
              </label>
              <input
                id="command"
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="예: 다음"
                autoComplete="off"
                className={INPUT_CLASS}
              />
              <Button type="submit" tone="inverse" icon={ICONS.send}>
                보내기
              </Button>
            </form>
          </aside>
        </div>

        {/* ── 음성 읽기 조작 (넓은 화면, 읽는 동안 화면 아래에 붙는다) ── */}
        {showTtsControl && (
          <div role="region" aria-label="음성 읽기 조작" className="sticky bottom-0 border-t-[3px] border-info bg-panel px-4 py-3 max-[960px]:hidden">
            <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-5 gap-y-3">
              <span className="min-w-0 flex-[1_1_240px] text-[18px] text-ink-2">{ttsStatus}</span>
              <button
                type="button"
                onClick={toggleTtsPause}
                aria-pressed={speech.paused}
                className="flex min-h-[64px] flex-[1_1_280px] items-center justify-center gap-2.5 rounded-2xl border-[3px] border-info bg-bg text-[22px] font-extrabold text-info hover:bg-info-tint"
              >
                <Icon d={speech.paused ? ICONS.play : ICONS.pause} />
                <span>{ttsPauseLabel}</span>
              </button>
            </div>
          </div>
        )}

        <footer className="border-t-2 border-line px-4 py-5 text-base text-ink-3 max-[960px]:pb-[250px]">
          <div className="mx-auto flex max-w-[1180px] flex-wrap justify-between gap-x-6 gap-y-2">
            <span>소리벗 · 와이코닉</span>
            <span>모든 음성 안내는 올린 사람이 확인하고 운영자가 검수한 뒤에만 공개됩니다.</span>
          </div>
        </footer>
      </div>
    </ShellContext.Provider>
  );
}

/** 머리말의 화면 종류 탭. 지금 화면이면 노랑 바탕 + aria-current */
function HeaderTab({ current, icon, onClick, children }: { current: boolean; icon: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={`flex min-h-[56px] items-center gap-2.5 whitespace-nowrap rounded-[14px] border-[3px] px-[22px] font-bold max-[960px]:flex-[1_1_150px] max-[960px]:justify-center ${
        current ? "border-accent bg-accent text-bg hover:border-accent-hover hover:bg-accent-hover" : "border-ink bg-bg text-ink hover:border-accent hover:bg-hover"
      }`}
    >
      <Icon d={icon} />
      <span>{children}</span>
    </button>
  );
}
