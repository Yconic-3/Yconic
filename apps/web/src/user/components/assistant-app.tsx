"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import {
  courseLabel,
  DIFFICULTY_LABELS,
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABELS,
  fitSpeechRate,
  guideLevelLabel,
  hasNarration,
  isNarrationAt,
  knowsMovement,
  movementLabel,
  type AgentAction,
  type AgentChatResponse,
  type AgentTurn,
  type CourseId,
  type ExerciseSegment,
  type LearningProfile,
  type MovementId,
  type PersonalizedGuides,
} from "@yconic/shared-types";
import { readSignedInAccount, signOut, type SignedInAccount } from "@/lib/auth";
import { createDefaultAgentClient, handleLocally, splitAgentActions } from "@/user/lib/agent";
import { createUserApi, errorMessage, type PublishedExercise } from "@/user/lib/api";
import { createCoursesApi } from "@/user/lib/courses-api";
import { createLearningApi, ruleGuide } from "@/user/lib/learning-api";
import { exerciseGuideLevel, guideIntro, practicedMovements } from "@/user/lib/movement-guides";
import { eulReul, eunNeun, ieyo } from "@/user/lib/korean";
import { parseIntent, type Intent } from "@/user/lib/intent";
import { HOME_VIEW, type View } from "@/user/lib/navigation";
import { formatDuration, SESSION_STATE_LABELS } from "@/user/lib/player";
import { searchExercises, searchPath, searchTerms } from "@/user/lib/search";
import { micPermissionText, requestMicPermission, watchMicPermission, type MicPermission } from "@/user/lib/mic-permission";
import { startListening, type Listener, type ListenError } from "@/user/lib/recognition";
import { playEarcon } from "@/user/lib/earcon";
import { ARM_MS, createCommandGate, WAKE_WORD } from "@/user/lib/wake-word";
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
import { Brand, Button, Caution, Icon, ICONS, INPUT_CLASS, ListButton, MicIcon, Section } from "./ui";
import { VideoCard, VideoRow } from "./video-cards";

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

const GREETING = '안녕하세요. 어떤 운동 영상을 찾을까요? "소리벗"이라고 부른 뒤 "하체 운동"처럼 말하거나, 큰 버튼을 누르고 말하거나, 아래 검색창에 써 주세요.';
const SAFETY_MESSAGE =
  "운동을 멈췄습니다. 편한 자세로 쉬세요. 통증이나 어지럼, 숨찬 느낌이 계속되면 운동을 그만하고 주변 사람이나 의료진의 도움을 받으세요.";
const HELP_MESSAGE =
  "먼저 소리벗이라고 부른 뒤 말해 주세요. 이렇게 말할 수 있습니다. 영상을 찾을 때는 하체 운동, 스트레칭처럼 찾을 말을. 영상을 고를 때는 운동 이름과 시작. 운동 중에는 멈춰, 계속, 다음, 이전, 다시. 그 밖에 음성 안내 꺼, 부르면 듣기 꺼, 스쿼트 배웠어, 로그인, 콘텐츠 올리기, 처음으로, 이전 화면.";

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

interface VoicePrefs {
  /** 음성 안내 켬·끔 */
  tts: boolean;
  /** 말 속도 */
  rate: number;
  /** 부르면 듣기 ("소리벗") 켬·끔 */
  wake: boolean;
}

function readPrefs(): VoicePrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    const v = raw ? (JSON.parse(raw) as { tts?: unknown; rate?: unknown; wake?: unknown }) : {};
    return { tts: v.tts !== false, rate: typeof v.rate === "number" ? clampRate(v.rate) : 1, wake: v.wake !== false };
  } catch {
    return { tts: true, rate: 1, wake: true };
  }
}

/** 바꾼 설정만 넘기면 나머지는 그대로 둔다 */
function writePrefs(patch: Partial<VoicePrefs>) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
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
  // 내 동작(학습 프로필): 강의로 배운 동작, 직접 알린 동작, 여러 번 따라 한 동작 (docs/decisions/0008)
  const learningApi = useMemo(() => createLearningApi(), []);
  const [learning, setLearning] = useState<LearningProfile | null>(null);
  const reloadLearning = useCallback(async () => {
    try {
      setLearning(await learningApi.getProfile());
    } catch {
      setLearning({ movements: [] });
    }
  }, [learningApi]);
  useEffect(() => {
    if (!accountId) {
      setLearning(null);
      return;
    }
    void reloadLearning();
  }, [accountId, reloadLearning]);
  const setLearnedCourses = useCallback(
    async (ids: CourseId[]) => {
      setLearned(await coursesApi.set(ids));
      // 강의를 바꾸면 그 강의의 동작이 아는 동작에 들어가거나 빠진다
      await reloadLearning();
    },
    [coursesApi, reloadLearning],
  );
  const setMovementKnown = useCallback(
    async (id: MovementId, known: boolean, terms?: string) => {
      setLearning(await learningApi.setMovement(id, { known, ...(terms !== undefined ? { terms } : {}) }));
    },
    [learningApi],
  );
  /** 이 운동을 짧게 안내할지 자세하게 안내할지 (영상 속 동작을 모두 알면 짧게) */
  const levelOf = useCallback((e: Pick<PublishedExercise, "segments">) => exerciseGuideLevel(e, accountId ? learning : null), [accountId, learning]);

  const [exercises, setExercises] = useState<PublishedExercise[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [log, setLog] = useState<Message[]>([{ id: 0, who: "bot", text: GREETING }]);
  const [lastSaid, setLastSaid] = useState(GREETING);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  /** 스크린리더에 알릴 말 (음성 안내를 껐을 때와 설정이 바뀔 때) */
  const [announce, setAnnounce] = useState("");
  const [rate, setRate] = useState(1);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("큰 버튼을 누르고 말하세요.");
  /** 검색창에 쓴 말 */
  const [query, setQuery] = useState("");
  /** AI 에이전트의 답을 기다리는 중 */
  const [thinking, setThinking] = useState(false);
  /** children 페이지가 알려 준 제목·예시 말 */
  const [page, setPage] = useState<PageInfo | null>(null);
  /** 마이크 사용 권한 (브라우저가 알려 준 상태) */
  // 브라우저가 상태를 알려 주기 전에는 null (안내 카드가 깜빡이지 않게)
  const [mic, setMic] = useState<MicPermission | null>(null);
  const micRef = useRef(mic);
  micRef.current = mic;
  useEffect(() => watchMicPermission(setMic), []);

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
  /** 에이전트가 이미 말했으면 검색 결과 화면이 결과를 다시 읽지 않게 한다 */
  const quietPageRef = useRef(false);
  const logRef = useRef(log);
  logRef.current = log;

  // 지난번 음성 설정을 불러온다
  useEffect(() => {
    const prefs = readPrefs();
    setSpeechEnabled(prefs.tts);
    wakeEnabledRef.current = prefs.wake;
    setWakeEnabledState(prefs.wake);
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

  // 시청 화면은 주소(/exercises/[id])가 정한다. 검색 결과는 /search 페이지가 그린다.
  const view: View = useMemo(() => (routeExerciseId ? { name: "exercise", exerciseId: routeExerciseId } : HOME_VIEW), [routeExerciseId]);
  const mode: ShellMode = pathname.startsWith(SUPPLY_PREFIX) ? "supply" : (page?.mode ?? "consume");

  // 화면이 바뀌면 맨 위로 올리고 제목으로 초점을 옮겨, 스크린리더가 새 화면의 처음부터 읽게 한다.
  const viewKey = `${pathname}|${page?.title ?? ""}`;
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
    (text: string, audioUrl?: string | null, opts?: { fitSec?: number }) => {
      addMessage("bot", text);
      setLastSaid(text);
      if (!speechEnabledRef.current) setAnnounce(text);
      // 단계 안내는 그 단계 안에 다 읽도록 말 속도를 맞춘다 (영상 속도에 맞추기)
      const rate = opts?.fitSec ? fitSpeechRate(text, opts.fitSec, rateRef.current) : rateRef.current;
      return speak(text, { rate, audioUrl });
    },
    [addMessage],
  );

  const exerciseLevel = exercise ? levelOf(exercise) : "detailed";
  const profileRef = useRef(learning);
  profileRef.current = accountId ? learning : null;

  // 맞춤 안내: 로그인했으면 서버(AI)가 이 사람에 맞게 다시 쓴 단계 안내를 받는다.
  // 받기 전이나 받지 못하면 규칙(아는 동작이면 짧은 안내)으로 읽는다.
  const [guides, setGuides] = useState<PersonalizedGuides | null>(null);
  const [guidesLoading, setGuidesLoading] = useState(false);
  const exerciseId = exercise?.id ?? null;
  useEffect(() => {
    setGuides(null);
    if (!exercise || !accountId || !learning) return;
    let cancelled = false;
    setGuidesLoading(true);
    learningApi
      .getGuides(exercise)
      .then((g) => !cancelled && setGuides(g))
      .catch(() => undefined)
      .finally(() => !cancelled && setGuidesLoading(false));
    return () => {
      cancelled = true;
    };
    // 운동이 바뀌거나 내 동작이 바뀌면 다시 받는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId, accountId, learning, learningApi]);
  const guideFor = useCallback(
    (s: ExerciseSegment) => (guides?.exerciseId === exerciseId ? guides.segments.find((g) => g.segmentId === s.id) : undefined) ?? ruleGuide(s, accountId ? learning : null),
    [accountId, exerciseId, guides, learning],
  );
  const guideOf = useCallback((s: ExerciseSegment) => guideFor(s).text, [guideFor]);
  const session = useExerciseSession(exercise, videoRef, say, guideOf);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // 영상 소리와 앱의 음성이 겹치지 않게 한다 (docs/decisions/0009).
  // 음성 안내를 켜면: 앱이 말하는 동안, 호출어를 듣는 동안, 영상 속 강사가 말하는 동안 영상 소리를 끈다.
  //   강사의 말은 이 사람에 맞게 다시 쓴 안내가 대신하고, 음악·박자 소리는 그대로 들린다.
  // 음성 안내를 끄면(일반 사용자): 원래 영상 소리를 그대로 들려준다.
  const armedRef = useRef(false);
  useEffect(() => {
    if (!exercise) return;
    const segments = exercise.segments;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const sp = getSpeechState();
      const mute = sp.enabled && (sp.speaking || armedRef.current || isNarrationAt(segments, video.currentTime));
      if (video.muted !== mute) video.muted = mute;
    }, 100);
    return () => window.clearInterval(timer);
  }, [exercise]);

  // 끝까지 따라 하면 이 영상의 동작을 연습한 것으로 기록한다. 세 번이면 그 동작은 짧게 안내한다.
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (session.state !== "COMPLETED") {
      reportedRef.current = null;
      return;
    }
    if (!exercise || !accountId || reportedRef.current === exercise.id) return;
    reportedRef.current = exercise.id;
    const ids = practicedMovements(exercise);
    if (ids.length === 0) return;
    const before = learning;
    learningApi
      .recordPractice(ids)
      .then((after) => {
        setLearning(after);
        const newlyKnown = ids.filter((id) => !knowsMovement(before, id) && knowsMovement(after, id));
        if (newlyKnown.length) void say(`${eulReul(newlyKnown.map(movementLabel).join(", "))} 여러 번 따라 하셨어요. 다음부터는 짧게 안내할게요.`);
      })
      .catch(() => undefined);
  }, [accountId, exercise, learning, learningApi, say, session.state]);

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
      // 왜 짧게/자세하게 안내하는지 먼저 알린다 (내 동작)
      const why = guideIntro(exercise, profileRef.current);
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
      if (pathname !== "/") router.push("/");
      if (!quiet) void say("처음 화면입니다. 어떤 운동 영상을 찾을까요?");
    },
    [mode, pathname, router, say],
  );

  const handleBack = useCallback(
    (quiet = false) => {
      stopSpeaking();
      if (pathname === "/") {
        if (!quiet) void say("처음 화면입니다.");
        return;
      }
      // 브라우저의 이전 화면으로 간다. 시청 화면에서 돌아가면 검색 결과가 그대로 나온다.
      router.back();
      if (!quiet) void say("이전 화면입니다.");
    },
    [pathname, router, say],
  );

  /** 검색 결과 화면으로 간다. 결과는 그 화면이 읽어 준다. quiet면 읽지 않는다 (에이전트가 대신 말할 때) */
  const goSearch = useCallback(
    (text: string, quiet = false) => {
      stopSpeaking();
      quietPageRef.current = quiet;
      if (!searchTerms(text).length) {
        if (pathname !== "/") router.push("/");
        if (!quiet) void say(`전체 운동 영상은 ${exercises?.length ?? 0}개입니다. 찾을 말을 말하거나 영상을 골라 주세요.`);
        return;
      }
      router.push(searchPath(text));
    },
    [exercises, pathname, router, say],
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
      writePrefs({ tts: on });
      setAnnounce(on ? "음성 안내를 켰습니다." : "음성 안내를 껐습니다.");
      if (on) void say("음성 안내를 켰습니다.");
      else setLastSaid("음성 안내를 껐습니다. 이제 안내는 여기에 글로만 표시됩니다.");
    },
    [say],
  );

  /**
   * 마이크 사용을 허용해 달라고 한다. 브라우저 창이 뜨기 전에 말로 먼저 알린다.
   * 허용되면 true. 이미 차단돼 있으면 브라우저 설정에서 다시 허용하는 방법을 읽어 준다.
   */
  const askMicPermission = useCallback(async (): Promise<boolean> => {
    if (micRef.current === "denied") {
      const help = micPermissionText("denied").help;
      setVoiceStatus(`마이크 권한: 차단됨`);
      void say(help);
      return false;
    }
    setVoiceStatus("브라우저가 마이크 사용을 묻고 있어요. 허용을 눌러 주세요.");
    void say("브라우저가 마이크를 써도 되는지 물으면 허용을 눌러 주세요.");
    const result = await requestMicPermission();
    setMic(result);
    if (result === "granted") {
      setVoiceStatus("마이크를 쓸 수 있어요.");
      void say("마이크를 허용했습니다. 이제 큰 버튼을 누르고 말하세요.");
      return true;
    }
    setVoiceStatus(`마이크 권한: ${micPermissionText(result).label}`);
    void say(micPermissionText(result).help);
    return false;
  }, [say]);

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
    writePrefs({ rate: next });
    return next;
  }, []);

  const changeRate = useCallback(
    (delta: number) => {
      const next = adjustRate(delta);
      void say(`말하기 속도 ${next.toFixed(2)}배입니다.`);
    },
    [adjustRate, say],
  );

  /** 규칙 기반 해석(intent.ts)으로 처리한다. 에이전트가 꺼져 있거나 짧은 조작·앱 명령일 때 */
  const runIntent = useCallback(
    (intent: Intent, text = "") => {
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
        case "MIC":
          if (micRef.current === "granted") void say("마이크가 이미 허용되어 있습니다. 큰 버튼을 누르고 말하세요.");
          else void askMicPermission();
          return;
        case "TTS_ON":
          setTts(true);
          return;
        case "WAKE_ON":
          setWakeEnabled(true);
          return;
        case "WAKE_OFF":
          setWakeEnabled(false);
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
          goTo("/", "처음 화면입니다. 어떤 운동 영상을 찾을까요?");
          return;
        case "SUPPLY":
          goTo("/my/contents", "콘텐츠 올리기 화면입니다. 새 콘텐츠를 만들려면 새 콘텐츠라고 말해 주세요.");
          return;
        case "NEW_CONTENT":
          goTo("/my/contents/new", "새 콘텐츠 만들기입니다. 운동 영상 파일을 고르고 분석 시작이라고 말해 주세요.");
          return;
        case "COURSES": {
          if (!intent.courseId || !readSignedInAccount()) {
            goTo("/courses", "내 강의·동작 화면입니다. 배운 동작이나 강의를 고르면 어느 영상에서든 그 동작은 짧게 안내합니다.");
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
        case "MOVEMENT": {
          if (!readSignedInAccount()) {
            void say("배운 동작을 기록하려면 먼저 로그인해 주세요. 내 계정이라고 말하면 로그인 화면으로 갑니다.");
            return;
          }
          const name = movementLabel(intent.movementId);
          void setMovementKnown(intent.movementId, intent.known)
            .then(() =>
              say(
                intent.known
                  ? `${eulReul(name)} 배운 동작으로 기록했어요. 어느 영상에서든 ${eunNeun(name)} 짧게 안내할게요.`
                  : `${eulReul(name)} 배운 동작에서 뺐어요. ${eunNeun(name)} 자세하게 안내할게요.`,
              ),
            )
            .catch((e: unknown) => say(`내 동작을 저장하지 못했어요. ${e instanceof Error ? e.message : ""}`));
          return;
        }
        case "LIST":
          // 찾을 말이 있으면 검색 결과로, 없으면("운동 찾아줘") 처음 화면의 전체 목록으로
          goSearch(intent.category ? EXERCISE_CATEGORY_LABELS[intent.category] : (intent.keyword ?? text));
          return;
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
          // 알아듣지 못한 말은 검색어로 써 본다 ("목 풀기" → 목 스트레칭)
          if (mode === "consume" && text && searchExercises(all, text).length > 0) {
            goSearch(text);
            return;
          }
          void say(
            mode === "supply"
              ? "잘 못 들었어요. 새 콘텐츠, 분석 시작, 미리 듣기, 검수 요청, 운동하기 중에서 말씀해 주세요."
              : "그 말로는 영상을 찾지 못했어요. 다른 말로 찾거나, 도움말이라고 말해 주세요.",
          );
          return;
      }

      // 여기부터는 운동을 고른 뒤에만 쓰는 재생 명령
      if (!exercise) {
        void say('먼저 영상을 골라 주세요. "하체 운동"처럼 찾을 말을 하거나 "스쿼트 시작"이라고 말해 보세요.');
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
    [askMicPermission, changeRate, exercise, exercises, goSearch, goTo, handleBack, handleHome, handleLogout, learned, mode, openExercise, say, setLearnedCourses, setMovementKnown, setTts, toggleTtsPause],
  );

  /** 에이전트가 돌려준 할 일 하나를 말 없이 실행한다. 말은 에이전트의 답이 대신한다 */
  const runAgentAction = useCallback(
    (action: AgentAction) => {
      const s = sessionRef.current;
      switch (action.type) {
        case "SHOW_LIST":
          goSearch(action.keyword ?? (action.category ? EXERCISE_CATEGORY_LABELS[action.category] : ""), true);
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
    [adjustRate, exercise, goSearch, handleBack, handleHome, openExercise],
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
        runIntent(intent, text);
        return;
      }

      setThinking(true);
      const s = sessionRef.current;
      void agent
        .chat({
          message: text,
          history,
          context: {
            screen: routeExerciseId ? "exercise" : pathname === "/search" ? "list" : "home",
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
          else runIntent(intent, text);
        });
    },
    [addMessage, agent, exercise, exercises, mode, pathname, routeExerciseId, runAgentResponse, runIntent, view],
  );

  const handleCommandRef = useRef(handleCommand);
  handleCommandRef.current = handleCommand;

  // ── 부르면 듣기 (docs/decisions/0009) ──
  // 마이크를 켜 두고 "소리벗"이라고 부른 뒤의 말만 명령으로 받는다. 큰 버튼을 누르는 것은 부른 것과 같다.
  // 호출어 없이 들린 말(영상 속 강사의 말, 주변 소리)은 명령으로 받지 않는다.
  const gateRef = useRef(createCommandGate());
  const [armed, setArmed] = useState(false);
  const armTimerRef = useRef<number | null>(null);
  const [wakeEnabled, setWakeEnabledState] = useState(true);
  const wakeEnabledRef = useRef(wakeEnabled);
  wakeEnabledRef.current = wakeEnabled;

  const idleVoiceStatus = useCallback(
    () => (wakeEnabledRef.current && listenerRef.current ? `"${WAKE_WORD}"라고 부르거나 큰 버튼을 누르고 말하세요.` : "큰 버튼을 누르고 말하세요."),
    [],
  );
  const stopListener = useCallback(() => {
    listenerRef.current?.stop();
    listenerRef.current = null;
    setListening(false);
  }, []);
  /** 부르면 듣기가 꺼져 있고 듣기 상태도 아니면 마이크를 끈다 */
  const releaseListener = useCallback(() => {
    if (!wakeEnabledRef.current && !armedRef.current) stopListener();
  }, [stopListener]);
  const clearArmTimer = () => {
    if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    armTimerRef.current = null;
  };
  const disarm = useCallback(
    (sound: boolean) => {
      clearArmTimer();
      gateRef.current.disarm();
      armedRef.current = false;
      setArmed(false);
      if (sound) playEarcon("cancel");
      setVoiceStatus(idleVoiceStatus());
      releaseListener();
    },
    [idleVoiceStatus, releaseListener],
  );
  /** 다음 한 마디를 명령으로 받는다. 그동안 안내를 멈추고 영상 소리를 끈다 */
  const arm = useCallback(() => {
    gateRef.current.arm();
    armedRef.current = true;
    setArmed(true);
    stopSpeaking();
    playEarcon("listen");
    setVoiceStatus("듣고 있어요. 말씀하세요.");
    clearArmTimer();
    armTimerRef.current = window.setTimeout(() => disarm(true), ARM_MS);
  }, [disarm]);

  const heard = useCallback(
    (text: string) => {
      const r = gateRef.current.feed(text);
      if (!r) return;
      if (r.kind === "armed") {
        arm();
        return;
      }
      clearArmTimer();
      armedRef.current = false;
      setArmed(false);
      setVoiceStatus(`들린 말: "${r.text}"`);
      handleCommandRef.current(r.text);
      releaseListener();
    },
    [arm, releaseListener],
  );
  const heardRef = useRef(heard);
  heardRef.current = heard;

  /** 마이크 듣기를 켠다 (이미 켜져 있으면 그대로) */
  const ensureListener = useCallback((): boolean => {
    if (listenerRef.current) return true;
    const listener = startListening({
      onText: (text) => heardRef.current(text),
      onError: (error) => {
        setVoiceStatus(LISTEN_ERROR_TEXT[error]);
        if (error === "denied") setMic("denied");
        if (error !== "failed") {
          listenerRef.current = null;
          setListening(false);
        }
      },
    });
    if (!listener) return false;
    listenerRef.current = listener;
    setListening(true);
    return true;
  }, []);

  // 마이크가 허용돼 있고 부르면 듣기가 켜져 있으면 계속 듣는다
  useEffect(() => {
    if (wakeEnabled && mic === "granted") {
      if (ensureListener()) setVoiceStatus(idleVoiceStatus());
    } else if (!wakeEnabled && !armedRef.current) {
      stopListener();
    }
  }, [ensureListener, idleVoiceStatus, mic, stopListener, wakeEnabled]);

  const setWakeEnabled = useCallback(
    (on: boolean) => {
      wakeEnabledRef.current = on;
      setWakeEnabledState(on);
      writePrefs({ wake: on });
      void say(on ? `부르면 듣기를 켰어요. "${WAKE_WORD}"라고 부르면 들을게요.` : "부르면 듣기를 껐어요. 말하려면 큰 버튼을 눌러 주세요.");
    },
    [say],
  );

  /** 큰 버튼: "소리벗"이라고 부른 것과 같다. 듣는 중에 누르면 그만 듣는다 */
  const pressToTalk = useCallback(async () => {
    if (armedRef.current) {
      disarm(true);
      return;
    }
    // 아직 허용하지 않았으면 먼저 묻는다. 차단됐으면 다시 허용하는 방법을 알려 준다
    if (micRef.current !== "granted") {
      const ok = await askMicPermission();
      if (!ok) return;
    }
    if (!ensureListener()) return;
    arm();
  }, [arm, askMicPermission, disarm, ensureListener]);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const text = query.trim();
    if (!text) {
      void say("찾을 말을 먼저 써 주세요.");
      return;
    }
    const intent = parseIntent(text, exercises ?? []);
    if (intent.type === "SAFETY" || (intent.type !== "LIST" && intent.type !== "OPEN" && intent.type !== "UNKNOWN" && handleLocally(intent, text, exercise !== null))) {
      setQuery("");
      handleCommand(text);
      return;
    }
    addMessage("me", text);
    setLastHeard(text);
    goSearch(text);
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
      learning: accountId ? learning : null,
      setMovementKnown,
      say,
      setPage,
      setPageCommands: (handler) => {
        pageCommandsRef.current = handler;
      },
      exercises,
      levelOf,
      openExercise,
      shouldAnnounce: () => {
        const quiet = quietPageRef.current;
        quietPageRef.current = false;
        return !quiet;
      },
    }),
    [account, accountId, exercises, learned, learning, levelOf, openExercise, refreshAccount, say, setLearnedCourses, setMovementKnown],
  );

  // ── 화면에 쓸 값 ──
  const all = exercises ?? [];
  const currentSegment = exercise?.segments[session.segmentIndex] ?? null;
  const isHome = pathname === "/";
  const pageHeadline = !shellRoute
    ? (page?.title ?? "")
    : routeExerciseId
      ? (exercise?.title ?? (exerciseMissing ? "영상을 찾을 수 없어요" : "영상을 불러오는 중이에요"))
      : "어떤 운동 영상을 찾을까요?";
  const pageTitle = isHome ? "소리벗 — 말로 찾고, 듣고 따라 하는 운동" : pageHeadline ? `${pageHeadline} — 소리벗` : "소리벗";
  const hints =
    page?.chips ?? (exercise ? ["시작", "다음", "다시", "멈춰"] : mode === "supply" ? ["새 콘텐츠", "운동하기"] : ["하체 운동", "스트레칭", "스쿼트 시작"]);
  const others = exercise ? all.filter((e) => e.id !== exercise.id) : [];

  const ttsStatus = speech.paused ? "읽기를 잠시 멈췄습니다." : `읽는 중: ${lastSaid.length > 60 ? `${lastSaid.slice(0, 60)}…` : lastSaid}`;
  const ttsPauseLabel = speech.paused ? "이어서 읽기" : "읽기 잠시 멈춤";
  const showTtsControl = speech.speaking || speech.paused;

  /**
   * 말로 찾기 구역: 큰 「눌러서 말하기」 → 상태 → 검색창 → 방금 안내.
   * 시작 화면에서는 가운데 크게(제목 포함), 다른 화면에서는 본문 위에 놓는다.
   * 좁은 화면에서는 마이크만 화면 맨 아래에 붙는다.
   */
  const voiceArea = (
    <section id="voice" aria-label="말로 찾기" className={`flex flex-col gap-4 ${isHome ? "mx-auto w-full max-w-[760px] text-center" : "w-full max-w-[960px]"}`}>
      {isHome && (
        <div className="flex flex-col gap-2">
          <h1 ref={headingRef} tabIndex={-1} className="m-0 text-[44px] font-extrabold leading-tight tracking-[-0.5px] max-[960px]:text-[30px] max-[420px]:text-[26px]">
            어떤 운동 영상을 찾을까요?
          </h1>
          <p className="m-0 text-[20px] text-ink-2">큰 버튼을 누르고 말하거나, 아래 검색창에 써 주세요.</p>
        </div>
      )}

      <div className="flex flex-col gap-3 max-[960px]:fixed max-[960px]:inset-x-0 max-[960px]:bottom-0 max-[960px]:z-10 max-[960px]:gap-2 max-[960px]:border-t-2 max-[960px]:border-line max-[960px]:bg-panel max-[960px]:px-4 max-[960px]:pb-4 max-[960px]:pt-2.5">
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
          onClick={() => void pressToTalk()}
          aria-pressed={armed}
          className={`flex w-full items-center justify-center gap-4 rounded-3xl border-4 border-accent font-extrabold ${isHome ? "min-h-[128px] text-[30px]" : "min-h-[96px] text-[26px]"} max-[960px]:min-h-[88px] max-[960px]:text-[24px] ${
            armed ? "bg-accent text-bg hover:bg-accent-hover" : "bg-bg text-accent hover:bg-accent-tint"
          }`}
        >
          <MicIcon />
          <span>{armed ? "듣는 중 · 말씀하세요" : "눌러서 말하기"}</span>
        </button>
        <p role="status" className="m-0 text-[18px] text-ink-2 max-[960px]:text-center max-[960px]:text-[16px]">
          {thinking ? "답을 생각하고 있어요…" : voiceStatus}
          <span className="max-[960px]:hidden"> · 마이크 권한: {micPermissionText(mic ?? "unknown").label}</span>
        </p>
        <button
          type="button"
          onClick={() => setWakeEnabled(!wakeEnabled)}
          aria-pressed={wakeEnabled}
          className="m-0 self-start text-[17px] font-bold text-info underline decoration-2 underline-offset-[5px] hover:text-info-light max-[960px]:self-center max-[960px]:text-[15px]"
        >
          부르면 듣기(“{WAKE_WORD}”): {wakeEnabled ? (listening ? "켜짐 · 듣는 중" : "켜짐 · 마이크 허용 필요") : "꺼짐"}
        </button>
      </div>

      <p className="m-0 text-[17px] text-ink-3">
        이렇게 말해 보세요: {hints.map((h) => `“${h}”`).join(", ")}
      </p>

      {/* 마이크 안내: 시작 화면에서는 크게, 다른 화면에서는 한 줄로 (영상 목록이 밀리지 않게) */}
      {mic !== null && mic !== "granted" &&
        (isHome ? (
          <MicPermissionCard state={mic} onRequest={() => void askMicPermission()} />
        ) : (
          micPermissionText(mic).canRequest && (
            <p className="m-0 text-[17px] text-ink-2">
              마이크 권한: {micPermissionText(mic).label}.{" "}
              <button type="button" onClick={() => void askMicPermission()} className="font-bold text-info underline decoration-2 underline-offset-[5px] hover:text-info-light">
                {mic === "denied" ? "다시 허용하는 방법 듣기" : "마이크 사용 허용하기"}
              </button>
            </p>
          )
        ))}

      <form role="search" onSubmit={submitSearch} className="flex gap-3 max-[520px]:flex-col">
        <label htmlFor="search" className="sr-only">
          운동 영상 검색
        </label>
        <input
          id="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="운동 영상 검색 (예: 하체, 목, 스트레칭)"
          autoComplete="off"
          className={`${INPUT_CLASS} !min-h-[64px] flex-1 !text-[20px]`}
        />
        <Button type="submit" tone="inverse" icon={ICONS.search} block={false} className="!min-h-[64px] px-7">
          검색
        </Button>
      </form>

      <div className={`flex flex-col gap-1.5 rounded-2xl border-2 border-accent bg-panel px-5 py-4 ${isHome ? "text-left" : ""}`}>
        <h2 id="last-said-title" className="m-0 text-[16px] font-bold text-ink-3">
          방금 안내
        </h2>
        <p className="m-0 whitespace-pre-line text-[20px] leading-[1.55]">{lastSaid}</p>
        <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[16px] text-ink-3">
          <span>내가 한 말: {lastHeard ?? "아직 없음"}</span>
          <button
            type="button"
            onClick={() => void speak(lastSaid, { rate: rateRef.current })}
            className="font-bold text-info underline decoration-2 underline-offset-[5px] hover:text-info-light"
          >
            다시 듣기
          </button>
          <span className="flex items-center gap-2">
            말 속도 {rate.toFixed(2)}배
            <button type="button" onClick={() => changeRate(-RATE_STEP)} className="font-bold text-info underline decoration-2 underline-offset-[5px] hover:text-info-light">
              느리게
            </button>
            <button type="button" onClick={() => changeRate(RATE_STEP)} className="font-bold text-info underline decoration-2 underline-offset-[5px] hover:text-info-light">
              빠르게
            </button>
          </span>
        </p>
      </div>
    </section>
  );

  return (
    <ShellContext.Provider value={shellApi}>
      <div className="flex min-h-dvh flex-col">
        <title>{pageTitle}</title>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-3 focus:!text-bg">
          본문으로 건너뛰기
        </a>
        <a href="#voice" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-3 focus:!text-bg">
          말로 찾기로 건너뛰기
        </a>
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>

        {/* ── 머리말: 이름, 메뉴 (운동 찾기 · 콘텐츠 올리기 · 내 강의 · 계정 · 음성 안내) ── */}
        <header className="border-b-2 border-line">
          <div className="mx-auto flex max-w-[1280px] flex-nowrap items-center gap-x-6 gap-y-3 px-4 py-4 max-[1100px]:flex-wrap">
            <Brand />
            <nav aria-label="메뉴" className="ml-auto flex flex-nowrap items-center gap-2 max-[1100px]:ml-0 max-[1100px]:w-full max-[1100px]:flex-wrap">
              <HeaderTab current={mode === "consume" && pathname !== "/courses" && pathname !== "/account"} icon={ICONS.search} onClick={() => runIntent({ type: "CONSUME" })}>
                운동 찾기
              </HeaderTab>
              <HeaderTab current={mode === "supply"} icon={ICONS.upload} onClick={() => runIntent({ type: "SUPPLY" })}>
                콘텐츠 올리기
              </HeaderTab>
              <HeaderTab current={pathname === "/courses"} icon={ICONS.book} onClick={() => runIntent({ type: "COURSES", courseId: null, learned: true })}>
                내 동작
              </HeaderTab>
              <button
                type="button"
                onClick={() => runIntent({ type: "ACCOUNT" })}
                aria-current={pathname === "/account" ? "page" : undefined}
                className="flex min-h-[56px] items-center gap-2.5 whitespace-nowrap rounded-[14px] border-[3px] border-info bg-bg px-5 font-bold text-info hover:bg-info-tint active:bg-info active:text-bg max-[1100px]:flex-[1_1_150px] max-[1100px]:justify-center"
              >
                <Icon d={account ? ICONS.user : ICONS.login} />
                <span>{account ? `${account.name}님` : "로그인"}</span>
              </button>
              {account?.adminRole && (
                <Link
                  href="/admin"
                  className="flex min-h-[56px] items-center gap-2.5 whitespace-nowrap rounded-[14px] border-[3px] border-info bg-bg px-5 font-bold !text-info no-underline hover:bg-info-tint max-[1100px]:flex-[1_1_150px] max-[1100px]:justify-center"
                >
                  <Icon d={ICONS.shield} />
                  <span>관리자</span>
                </Link>
              )}
              <button
                type="button"
                onClick={() => setTts(!speech.enabled)}
                aria-pressed={speech.enabled}
                className="flex min-h-[56px] items-center gap-2.5 whitespace-nowrap px-2.5 font-bold text-info underline decoration-2 underline-offset-[5px] hover:text-info-light hover:decoration-[3px] max-[1100px]:flex-[1_1_150px] max-[1100px]:justify-center"
              >
                <Icon d={speech.enabled ? ICONS.speaker : ICONS.speakerOff} />
                <span>음성 안내: {speech.enabled ? "켜짐" : "꺼짐"}</span>
              </button>
            </nav>
          </div>
        </header>

        <main id="main" className="mx-auto box-border flex w-full max-w-[1280px] flex-1 flex-col gap-12 px-4 pb-[72px] pt-10 max-[960px]:gap-10 max-[960px]:pb-10 max-[960px]:pt-7">
          {voiceArea}

          {!isHome && (
            <nav aria-label="화면 이동" className="flex flex-wrap gap-3">
              <Button tone="soft" icon={ICONS.back} block={false} onClick={() => handleBack()}>
                이전 화면
              </Button>
              <Button tone="soft" icon={ICONS.home} block={false} onClick={() => handleHome()}>
                {mode === "supply" ? "내 콘텐츠로" : "처음으로"}
              </Button>
            </nav>
          )}

          {/* ── 시작 화면: 분류로 바로 찾기, 모든 운동 영상 ── */}
          {isHome && (
            <>
              <section aria-labelledby="category-title" className="flex flex-col gap-4">
                <h2 id="category-title" className="m-0 text-[24px] font-extrabold">
                  분류로 찾기
                </h2>
                <div className="flex flex-wrap gap-3">
                  {EXERCISE_CATEGORIES.map((c) => (
                    <Button key={c} tone="line" block={false} onClick={() => goSearch(EXERCISE_CATEGORY_LABELS[c])} className="px-6">
                      {EXERCISE_CATEGORY_LABELS[c]}
                    </Button>
                  ))}
                </div>
              </section>

              <Section id="videos-title" title={`모든 운동 영상 ${exercises ? `${all.length}개` : ""}`}>
                {loadError ? (
                  <>
                    <p role="alert" className="m-0 text-ink-2">
                      영상 목록을 불러오지 못했어요. {loadError}
                    </p>
                    <Button tone="soft" block={false} onClick={() => void loadExercises()}>
                      다시 시도
                    </Button>
                  </>
                ) : exercises === null ? (
                  <p className="m-0 text-ink-2">영상 목록을 불러오는 중이에요.</p>
                ) : all.length === 0 ? (
                  <p className="m-0 text-ink-2">아직 공개된 운동 영상이 없어요.</p>
                ) : (
                  <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-x-5 gap-y-8 p-0">
                    {all.map((e) => (
                      <li key={e.id}>
                        <VideoCard
                          exercise={e}
                          level={levelOf(e)}
                          onOpen={() => {
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

          {/* ── 시청 화면: 왼쪽 영상·조작·단계, 오른쪽 다음 영상 ── */}
          {routeExerciseId && exercise && (
            <div className="flex items-start gap-8 max-[1100px]:flex-col max-[1100px]:items-stretch">
              <div className="flex min-w-0 flex-1 flex-col gap-8">
                <section aria-label={`${exercise.title} 영상`} className="flex flex-col gap-4">
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
                  <h1 ref={headingRef} tabIndex={-1} className="m-0 text-[34px] font-extrabold leading-tight max-[960px]:text-[28px]">
                    {exercise.title}
                  </h1>
                  <p className="m-0 text-[18px] text-ink-2">
                    {EXERCISE_CATEGORY_LABELS[exercise.category]} · {DIFFICULTY_LABELS[exercise.difficulty]} · {formatDuration(exercise.video.durationSec)} · {guideLevelLabel(exerciseLevel)} 안내
                  </p>
                  {accountId && (
                    <p className="m-0 text-[18px] font-bold text-info-light" aria-live="polite">
                      {guidesLoading
                        ? "AI가 내 동작에 맞춘 안내를 만들고 있어요. 그동안은 기본 안내로 읽어요."
                        : guides?.generatedBy === "ai"
                          ? "AI 맞춤 안내: 배운 동작은 배운 말로 짧게, 처음 하는 동작은 자세히 읽어요."
                          : "내 동작에 맞춰 안내해요. 배운 동작은 짧게, 처음 하는 동작은 자세히 읽어요."}
                    </p>
                  )}
                  {exercise.summary && <p className="m-0 rounded-2xl bg-panel px-5 py-4 text-[19px]">{exercise.summary}</p>}
                </section>

                <section aria-labelledby="control-title" className="flex flex-col gap-4">
                  <h2 id="control-title" className="m-0 text-[26px] font-extrabold">
                    {session.segmentIndex + 1}/{exercise.segments.length}단계 {currentSegment?.title ?? ""}
                  </h2>
                  <p className="m-0 text-[18px] text-ink-2">지금 상태: {session.playing ? "안내 중" : SESSION_STATE_LABELS[session.state]}</p>
                  <Button tone="primary" size="xl" icon={session.playing ? ICONS.pause : ICONS.play} onClick={togglePlay} className="!min-h-[84px] !text-[28px]">
                    {session.playing ? "멈춤" : session.started && session.state === "PAUSED" ? "계속" : "시작"}
                  </Button>
                  <div className="grid grid-cols-3 gap-3 max-[640px]:grid-cols-1">
                    <Button size="lg" icon={ICONS.prev} onClick={session.previous}>
                      이전 단계
                    </Button>
                    <Button size="lg" icon={ICONS.repeat} onClick={session.repeat}>
                      다시 듣기
                    </Button>
                    <Button size="lg" icon={ICONS.next} onClick={session.next}>
                      다음 단계
                    </Button>
                  </div>
                  {/* 음성 안내 켜기·끄기: 시각장애인은 맞춤 안내로, 일반 사용자는 원래 영상 그대로 (docs/decisions/0009) */}
                  <Button size="lg" icon={speech.enabled ? ICONS.speakerOff : ICONS.speaker} aria-pressed={!speech.enabled} onClick={() => setTts(!speech.enabled)}>
                    {speech.enabled ? "음성 안내 끄고 원래 영상으로 보기" : "음성 안내 켜기"}
                  </Button>
                  <p className="m-0 text-[18px] text-ink-2">
                    {!speech.enabled
                      ? "음성 안내가 꺼져 있어요. 영상 소리를 그대로 들려 드려요."
                      : hasNarration(exercise.segments)
                        ? "음성 안내가 켜져 있어요. 강사가 말하는 부분은 영상 소리를 끄고, 내가 배운 것에 맞춘 안내로 대신 읽어 드려요."
                        : "음성 안내가 켜져 있어요. 단계마다 안내를 읽어 드려요."}
                  </p>
                  {exercise.precautions.length > 0 && <Caution label="주의할 자세">{exercise.precautions.join(" ")}</Caution>}
                </section>

                <Section id="steps-title" title="전체 단계">
                  <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
                    {exercise.segments.map((seg, i) => {
                      const current = i === session.segmentIndex;
                      const g = guideFor(seg);
                      return (
                        <li key={seg.id}>
                          <ListButton
                            icon={current ? ICONS.speaker : ICONS.dot}
                            title={`${i + 1}단계. ${seg.title}`}
                            mark={current ? " (지금)" : ""}
                            sub={`${g.reason ? `[${g.reason}] ` : ""}${g.text || "이 단계에는 음성 안내가 없어요."}`}
                            current={current}
                            currentKind="step"
                            onClick={() => session.goToSegment(i)}
                          />
                        </li>
                      );
                    })}
                  </ol>
                </Section>
              </div>

              <aside aria-labelledby="next-title" className="flex w-[400px] flex-none flex-col gap-3 max-[1100px]:w-full">
                <h2 id="next-title" className="m-0 text-[24px] font-extrabold">
                  다음 영상
                </h2>
                {others.length === 0 ? (
                  <p className="m-0 text-ink-2">다른 영상이 없어요.</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {others.map((e) => (
                      <li key={e.id}>
                        <VideoRow exercise={e} level={levelOf(e)} compact onOpen={() => openExercise(e.id, true)} />
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          )}

          {exerciseMissing && (
            <Section id="missing-title" title="영상을 찾을 수 없어요">
              <p className="m-0 text-ink-2">공개가 끝났거나 주소가 잘못되었어요. 처음 화면에서 다시 찾아 주세요.</p>
            </Section>
          )}

          {/* ── 다른 페이지 (검색 결과, 내 계정, 내 강의, 내 콘텐츠 …) ── */}
          {!shellRoute && (
            <>
              <h1 ref={headingRef} tabIndex={-1} className="m-0 text-[40px] font-extrabold leading-tight tracking-[-0.5px] max-[960px]:text-[28px]">
                {pageHeadline}
              </h1>
              {children}
            </>
          )}
        </main>

        {/* ── 음성 읽기 조작 (넓은 화면, 읽는 동안 화면 아래에 붙는다) ── */}
        {showTtsControl && (
          <div role="region" aria-label="음성 읽기 조작" className="sticky bottom-0 border-t-[3px] border-info bg-panel px-4 py-3 max-[960px]:hidden">
            <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-5 gap-y-3">
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

        <footer className="border-t-2 border-line px-4 py-5 text-base text-ink-3 max-[960px]:pb-[200px]">
          <div className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-x-6 gap-y-2">
            <span>소리벗 · 와이코닉</span>
            <span>모든 음성 안내는 올린 사람이 확인하고 운영자가 검수한 뒤에만 공개됩니다.</span>
          </div>
        </footer>
      </div>
    </ShellContext.Provider>
  );
}

/** 마이크를 아직 쓸 수 없을 때 본문 위쪽에 보여 주는 안내 */
function MicPermissionCard({ state, onRequest }: { state: MicPermission; onRequest: () => void }) {
  const text = micPermissionText(state);
  return (
    <section aria-labelledby="mic-permission-title" className="flex flex-col gap-4 rounded-[20px] border-2 border-info bg-panel p-6 text-left">
      <h2 id="mic-permission-title" className="m-0 text-[24px] font-extrabold">
        마이크 사용 허용
      </h2>
      <p className="m-0 text-[18px] text-ink-2">
        <span className="font-bold text-ink">마이크 권한: {text.label}.</span> {text.help}
      </p>
      {text.canRequest && (
        <Button tone="info" size="lg" icon={ICONS.check} onClick={onRequest} className="!min-h-[72px] !text-[23px]">
          {state === "denied" ? "다시 확인하기" : "마이크 사용 허용하기"}
        </Button>
      )}
    </section>
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
