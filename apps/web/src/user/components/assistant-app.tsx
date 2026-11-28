"use client";

import { usePathname, useRouter } from "next/navigation";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import {
  courseLabel,
  DIFFICULTY_LABELS,
  EXERCISE_CATEGORY_LABELS,
  fitSpeechRate,
  guideLevelLabel,
  hasNarration,
  isNarrationAt,
  findsHard,
  knowsMovement,
  movementLabel,
  PRACTICE_THRESHOLD,
  type AgentAction,
  type AgentChatResponse,
  type AgentTurn,
  type CourseId,
  type ExerciseSegment,
  type LearningProfile,
  type MovementId,
  type PersonalizedGuides,
} from "@yconic/shared-types";
import { readSignedInAccount, signOut, type SignedInAccount, verifySession } from "@/lib/auth";
import { createDefaultAgentClient, handleLocally, splitAgentActions } from "@/user/lib/agent";
import { createUserApi, errorMessage, type PublishedExercise } from "@/user/lib/api";
import { createCoursesApi } from "@/user/lib/courses-api";
import { createLearningApi, ruleGuide } from "@/user/lib/learning-api";
import { exerciseGuideLevel, guideIntro, practicedMovements } from "@/user/lib/movement-guides";
import { eulReul, eunNeun, ieyo } from "@/user/lib/korean";
import { parseIntent, type Intent } from "@/user/lib/intent";
import { HOME_VIEW, type View } from "@/user/lib/navigation";
import { formatDuration } from "@/user/lib/player";
import { searchExercises, searchPath, searchTerms, VIDEOS_PATH } from "@/user/lib/search";
import { micPermissionText, requestMicPermission, watchMicPermission, type MicPermission } from "@/user/lib/mic-permission";
import { startListening, type Listener, type ListenError } from "@/user/lib/recognition";
import { playEarcon } from "@/user/lib/earcon";
import { FONT_CHOICES, nearestChoice, RATE_CHOICES, SettingsDialog } from "./settings-dialog";
import { GuideDialog } from "./guide-dialog";
import { EXERCISE_TIP, GUIDE_SPEECH_BODY, GUIDE_SPEECH_END, isGuideSkip, markIntroSeen, markTipSeen, readGuideSeen } from "@/user/lib/guide";
import { afterWakeWord, ARM_MS, createCommandGate, WAKE_WORD } from "@/user/lib/wake-word";
import { classifyAnswer } from "@/user/lib/confirm";
import { createStreamSpeaker, type StreamSpeaker } from "@/user/lib/stream-speech";
import { BACKCHANNEL_DELAY_MS, BACKCHANNEL_MAX_MS, endOfSpeechWaitMs, isBackchannelEcho, pickBackchannel } from "@/user/lib/turn-taking";
import { readHistory, recommendNext, recordCompletion, timesDone } from "@/user/lib/history";
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
  spokenEcho,
  stopSpeaking,
  subscribeSpeech,
} from "@/user/lib/speech";
import { useExerciseSession } from "@/user/lib/use-exercise-session";
import { Brand, Button, Caution, Icon, ICONS, INPUT_CLASS, ListButton, MicIcon, Section } from "./ui";

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
  "먼저 소리벗이라고 부른 뒤 말해 주세요. 이렇게 말할 수 있습니다. 영상을 찾을 때는 하체 운동, 스트레칭처럼 찾을 말을. 영상을 고를 때는 운동 이름과 시작. 운동 중에는 멈춰, 계속, 다음, 이전, 다시. 그 밖에 음성 안내 꺼, 부르면 듣기 꺼, 스쿼트 배웠어, 로그인, 콘텐츠 올리기, 처음으로, 이전 화면.";

const LISTEN_ERROR_TEXT: Record<ListenError, string> = {
  unsupported: "이 브라우저는 음성 인식을 지원하지 않아요. 아래 칸에 글로 입력해 주세요.",
  denied: "마이크 사용이 허용되지 않았어요. 브라우저 설정에서 허용하거나 글로 입력해 주세요.",
  failed: "음성 인식이 잠시 끊겼어요. 마이크 버튼을 다시 눌러 주세요.",
};

/** 에이전트에게 함께 보내는 최근 대화 수 */
const LOG_LIMIT = 8;
/** 답을 이만큼 기다렸으면 조금 늦어진다고 알린다 */
const THINKING_SLOW_MS = 4_000;
/** 에이전트가 끝내 답하지 않아도 이 시간이 지나면 규칙 기반 해석으로 넘어간다 (에이전트 연결의 제한 시간보다 조금 길게) */
const THINKING_MAX_MS = 16_000;

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
  /** 글자 크기 배율 (보통 1, 크게 1.15, 아주 크게 1.3) */
  font: number;
  /** 단계가 끝날 때마다 다음 단계로 갈지 묻기 (docs/decisions/0012) */
  askSteps: boolean;
}

function readPrefs(): VoicePrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    const v = raw ? (JSON.parse(raw) as { tts?: unknown; rate?: unknown; wake?: unknown; font?: unknown; askSteps?: unknown }) : {};
    return {
      tts: v.tts !== false,
      rate: typeof v.rate === "number" ? clampRate(v.rate) : 1,
      wake: v.wake !== false,
      font: typeof v.font === "number" && v.font >= 1 && v.font <= 1.5 ? v.font : 1,
      askSteps: v.askSteps !== false,
    };
  } catch {
    return { tts: true, rate: 1, wake: true, font: 1, askSteps: true };
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
  const [accountReady, setAccountReady] = useState(false);
  const speech = useSyncExternalStore(subscribeSpeech, getSpeechState, getServerSpeechState);

  // 로그인 상태는 브라우저 저장소에 있으므로 화면이 뜬 뒤에 읽는다. 다른 화면에서 돌아오면 다시 읽는다.
  const refreshAccount = useCallback(() => {
    setAccount(readSignedInAccount());
    setAccountReady(true);
  }, []);
  useEffect(refreshAccount, [pathname, refreshAccount]);
  // 들어올 때 서버에 로그인이 아직 유효한지 묻는다. 로그인 유지면 이때 기간이 늘어나고, 서버에서 끝난 로그인은 여기서 지워진다 (0017)
  useEffect(() => {
    let alive = true;
    void verifySession().then((a) => alive && setAccount(a));
    return () => {
      alive = false;
    };
  }, []);

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
      setLearning(
        await learningApi.setMovement(id, {
          known,
          ...(terms !== undefined ? { terms } : {}),
        }),
      );
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
  const thinkingRef = useRef(thinking);
  thinkingRef.current = thinking;
  // 답이 늦어지면 기다려 달라고 알린다
  const [thinkingSlow, setThinkingSlow] = useState(false);
  useEffect(() => {
    if (!thinking) {
      setThinkingSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setThinkingSlow(true), THINKING_SLOW_MS);
    return () => window.clearTimeout(timer);
  }, [thinking]);
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
    setFontScale(prefs.font);
    askStepsRef.current = prefs.askSteps;
    setAskSteps(prefs.askSteps);
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
  /**
   * 말 대신 글로 입력한 뒤에는 대답을 소리 내지 않고 글로만 보여 준다 (글로 쓰는 사람은 화면을 보는 사람).
   * 다시 말로 하거나(마이크) 운동 단계 안내를 읽을 때는 소리를 낸다. 스크린리더에는 알림으로 알린다.
   */
  const quietRepliesRef = useRef(false);
  const say = useCallback(
    (text: string, audioUrl?: string | null, opts?: { fitSec?: number; guide?: boolean; spoken?: Promise<boolean> }) => {
      addMessage("bot", text);
      setLastSaid(text);
      // 받는 대로 이미 읽고 있는 답 (0020): 다시 읽지 않고, 그 읽기가 끝나기를 기다린다
      if (opts?.spoken) return opts.spoken;
      if (quietRepliesRef.current && !opts?.guide) {
        setAnnounce(text);
        return Promise.resolve(true);
      }
      if (!speechEnabledRef.current) setAnnounce(text);
      // 단계 안내는 그 단계 안에 다 읽도록 말 속도를 맞춘다 (영상 속도에 맞추기)
      const rate = opts?.fitSec ? fitSpeechRate(text, opts.fitSec, rateRef.current) : rateRef.current;
      return speak(text, { rate, audioUrl });
    },
    [addMessage],
  );

  // ── 사용법 안내 (docs/decisions/0013): 처음 한 번만 저절로 뜨고, 그 뒤로는 부를 때만 연다 ──
  const [guide, setGuide] = useState<"first" | "replay" | null>(null);
  const guideRef = useRef(guide);
  guideRef.current = guide;
  const [guideSpeaking, setGuideSpeaking] = useState(false);
  /** 지금 읽고 있는 안내의 번호. 닫거나 새로 읽으면 올려서 앞의 읽기가 끝난 것을 무시한다 */
  const guideSpeechSeq = useRef(0);
  const guideSpeakingRef = useRef(false);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  /** 운동 화면을 처음 열 때 한 번만 보여 주는 한 줄 안내 */
  const [exerciseTip, setExerciseTip] = useState(false);
  useEffect(() => {
    if (!readGuideSeen().intro) setGuide("first");
  }, []);
  const closeGuide = useCallback(() => {
    const kind = guideRef.current;
    if (!kind) return;
    guideSpeechSeq.current++;
    const wasSpeaking = guideSpeakingRef.current;
    guideSpeakingRef.current = false;
    setGuideSpeaking(false);
    if (wasSpeaking) stopSpeaking();
    markIntroSeen();
    guideRef.current = null;
    setGuide(null);
    // 닫으면 초점을 돌려준다 (처음 안내는 화면 제목으로, 다시 연 것은 물음표 버튼으로)
    window.setTimeout(() => (kind === "first" ? headingRef.current : helpButtonRef.current)?.focus({ preventScroll: true }), 0);
  }, []);
  /** 사용법을 소리로 읽고, 다 읽으면 창을 닫는다. full이면 말할 수 있는 말까지 모두 읽는다 */
  const listenGuide = useCallback(
    (full: boolean) => {
      const seq = ++guideSpeechSeq.current;
      guideSpeakingRef.current = true;
      setGuideSpeaking(true);
      void speak(full ? `${GUIDE_SPEECH_BODY} ${HELP_MESSAGE}` : `${GUIDE_SPEECH_BODY} ${GUIDE_SPEECH_END}`, { rate: rateRef.current }).then((finished) => {
        if (seq !== guideSpeechSeq.current) return;
        guideSpeakingRef.current = false;
        setGuideSpeaking(false);
        if (finished) closeGuide();
      });
    },
    [closeGuide],
  );
  /** 사용법을 다시 연다 (물음표 버튼, "사용법 알려줘", 설정). listen이면 음성 안내가 켜져 있을 때 바로 읽는다 */
  const openGuide = useCallback(
    (listen: boolean, full = false) => {
      guideRef.current = "replay";
      setGuide("replay");
      if (listen && speechEnabledRef.current) listenGuide(full);
    },
    [listenGuide],
  );

  // ── 묻고 기다리기 (docs/decisions/0012): 단계를 넘기거나 화면을 바꾸기 전에 묻고 대답을 기다린다 ──
  const pendingConfirmRef = useRef<{ yes: () => void; no?: () => void } | null>(null);
  // 묻고 기다리는 동안에는 화면에 네·아니요 버튼도 보여 준다 (말로 대답하지 않아도 눌러서 넘어갈 수 있게)
  const [confirming, setConfirming] = useState(false);
  const setPendingConfirm = useCallback((pending: { yes: () => void; no?: () => void } | null) => {
    pendingConfirmRef.current = pending;
    setConfirming(pending !== null);
  }, []);
  const ask = useCallback(
    (question: string, yes: () => void, no?: () => void) => {
      setPendingConfirm({ yes, no });
      return say(question);
    },
    [say, setPendingConfirm],
  );
  // 화면이 바뀌면 앞 화면에서 한 질문은 더 묻지 않는다
  useEffect(() => setPendingConfirm(null), [pathname, setPendingConfirm]);
  const [askSteps, setAskSteps] = useState(true);
  const askStepsRef = useRef(askSteps);
  askStepsRef.current = askSteps;
  /** 운동 중 말 걸기: 사람이 말하는 동안(중간 결과가 들어오는 동안) 영상 소리를 끄기 위한 시각 */
  const userTalkingUntilRef = useRef(0);
  // 방금 한 맞장구 ("잠시만요."). 이 말이 마이크로 다시 들어오면 사람의 말로 보지 않는다 (0019)
  const backchannelRef = useRef<{ text: string; until: number } | null>(null);
  // 말 끝을 기다리는 시간을 정할 때 본다: 운동 화면이 열려 있는지
  const exerciseOpenRef = useRef(false);
  exerciseOpenRef.current = exercise !== null;

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
  // 운동 단계 안내는 글로 입력했더라도 소리 낸다 (운동은 화면을 보지 않고 따라 하므로)
  const sayGuide = useCallback((text: string, audioUrl?: string | null, opts?: { fitSec?: number }) => say(text, audioUrl, { ...opts, guide: true }), [say]);
  const session = useExerciseSession(exercise, videoRef, sayGuide, guideOf, {
    // 음성 안내를 켠 사람(시각장애인)에게만 묻는다. 끈 사람(일반 사용자)은 원래 영상처럼 이어진다
    askBeforeNext: () => speechEnabledRef.current && askStepsRef.current,
  });
  const sessionRef = useRef(session);
  sessionRef.current = session;

  /**
   * 지금 단계를 다시 들었거나 "어려워요"라고 했다: 그 단계의 동작을 '어려워한 동작'으로 기록한다 (docs/decisions/0012).
   * 한 번 운동하는 동안 같은 단계는 한 번만 센다. 쌓이면 다음부터 더 쉽게 안내한다.
   */
  const notedStruggleRef = useRef(new Set<string>());
  const noteStruggle = useCallback(() => {
    const ex = exercise;
    const s = sessionRef.current;
    if (!ex || !accountId || !s.started) return;
    const seg = ex.segments[s.segmentIndex];
    const key = `${ex.id}:${s.segmentIndex}`;
    if (!seg?.movements?.length || notedStruggleRef.current.has(key)) return;
    notedStruggleRef.current.add(key);
    learningApi
      .recordStruggle(seg.movements)
      .then(setLearning)
      .catch(() => undefined);
  }, [accountId, exercise, learningApi]);
  useEffect(() => notedStruggleRef.current.clear(), [exercise?.id]);

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
      const mute =
        sp.enabled &&
        (sp.speaking || armedRef.current || thinkingRef.current || Date.now() < userTalkingUntilRef.current || isNarrationAt(segments, video.currentTime));
      if (video.muted !== mute) video.muted = mute;
    }, 100);
    return () => window.clearInterval(timer);
  }, [exercise]);

  // ── 운동을 마치면 (docs/decisions/0012) ──
  // 동작 연습을 기록하고(세 번이면 그 동작은 짧게 안내), 내가 한 운동 기록에 남기고,
  // 끊기지 않게 다음에 할 운동을 골라 "해 볼까요?"라고 묻는다.
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (session.state !== "COMPLETED") {
      reportedRef.current = null;
      return;
    }
    if (!exercise || reportedRef.current === exercise.id) return;
    reportedRef.current = exercise.id;
    const ids = practicedMovements(exercise);
    const before = accountId ? learning : null;
    // 이번에 세 번째로 따라 해서 새로 익힌 동작 (서버 기록을 기다리지 않고 미리 센다)
    const newlyKnown = before
      ? ids.filter((id) => {
          const k = before.movements.find((m) => m.movementId === id);
          return !knowsMovement(before, id) && (k?.practiceCount ?? 0) + 1 >= PRACTICE_THRESHOLD;
        })
      : [];
    if (accountId && ids.length > 0) {
      learningApi
        .recordPractice(ids)
        .then(setLearning)
        .catch(() => undefined);
    }
    const history = recordCompletion(accountId, exercise.id);
    const count = timesDone(history, exercise.id);
    const parts = [`수고하셨어요! ${eulReul(exercise.title)} 끝까지 마쳤어요.`];
    if (count > 1) parts.push(`이번이 ${count}번째예요.`);
    if (newlyKnown.length) parts.push(`${eunNeun(newlyKnown.map(movementLabel).join(", "))} 세 번 따라 하셔서 다음부터 짧게 안내할게요.`);
    const next = recommendNext(exercises ?? [], exercise.id, history);
    const toList = () =>
      ask(
        "그럼 운동 고르기로 갈까요?",
        () => goSearch(""),
        () => say("알겠어요. 여기 있을게요. 다시 하려면 \"시작\", 다른 운동은 \"운동 고르기\"라고 말해 주세요."),
      );
    if (next) {
      void ask(`${parts.join(" ")} 다음으로 ${eulReul(next.title)} 해 볼까요? "네" 또는 "아니"라고 말해 주세요.`, () => openExercise(next.id, true), toList);
    } else {
      parts.push("운동 고르기로 갈까요?");
      void ask(parts.join(" "), () => goSearch(""), () => say("알겠어요. 다시 하려면 \"시작\"이라고 말해 주세요."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.state, exercise?.id]);

  // ── 운동 화면 단축키 (docs/decisions/0012): 스페이스·K 시작/멈춤, ←·→ 이전/다음 단계, R 다시 듣기 ──
  // 입력칸이나 버튼에 초점이 있을 때는 그 요소의 원래 동작을 따른다
  useEffect(() => {
    if (!exercise) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, button, a, [role=dialog], video") || t.isContentEditable)) return;
      const s = sessionRef.current;
      const key = e.key.toLowerCase();
      if (key === " " || key === "k") {
        e.preventDefault();
        togglePlayRef.current();
      } else if (key === "arrowright") {
        e.preventDefault();
        s.next();
      } else if (key === "arrowleft") {
        e.preventDefault();
        s.previous();
      } else if (key === "r") {
        e.preventDefault();
        noteStruggle();
        s.repeat();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [exercise, noteStruggle]);

  // ── 단계가 끝나면 묻고 기다린다 (docs/decisions/0012) ──
  useEffect(() => {
    const nextIndex = session.awaitingNext;
    if (nextIndex === null || !exercise) return;
    const nextSeg = exercise.segments[nextIndex];
    if (!nextSeg) return;
    if ("vibrate" in navigator) navigator.vibrate?.(150);
    const yes = () => sessionRef.current.confirmNext();
    const no = () => void say(`알겠어요. 쉬었다가 준비되면 "다음"이라고 말해 주세요. 지금 단계를 다시 들으려면 "다시"라고 하세요.`);
    void ask(`${nextIndex}단계가 끝났어요. 다음은 ${nextIndex + 1}단계, ${nextSeg.title}. 넘어갈까요?`, yes, no);
    // 대답이 없으면 한 번만 더 묻고, 그 뒤로는 기다린다
    const again = window.setTimeout(() => {
      if (sessionRef.current.awaitingNext === nextIndex && !getSpeechState().speaking) void ask(`다음 단계로 갈까요? 준비되면 "네"라고 말해 주세요.`, yes, no);
    }, 15_000);
    return () => window.clearTimeout(again);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.awaitingNext, exercise?.id]);

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
      // 운동 화면을 처음 연 사람에게는 운동 중에 할 수 있는 말을 한 번만 알려 준다 (docs/decisions/0013)
      const tip = readGuideSeen().tips.includes("exercise") ? "" : EXERCISE_TIP;
      if (tip) {
        markTipSeen("exercise");
        setExerciseTip(true);
      }
      if (quiet) {
        if (autoplay) sessionRef.current.start();
        return;
      }
      // 왜 짧게/자세하게 안내하는지 먼저 알린다 (내 동작)
      const why = guideIntro(exercise, profileRef.current);
      // 시안 D 흐름 A3: 고르면 먼저 묻는다. "네"나 "시작"이라고 하면 시작한다
      const intro = autoplay
        ? [`${eulReul(exercise.title)} 시작합니다.`, why, tip]
        : [`${exercise.title} 안내를 시작할까요?`, why, tip, "“네” 또는 “시작”이라고 말해 주세요."];
      void say(intro.filter(Boolean).join(" ")).then((finished) => {
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
      // 찾을 말이 없으면("운동 찾아줘", "모든 영상") 모든 운동 영상 화면으로 간다. 그 화면이 개수를 읽어 준다
      if (!searchTerms(text).length) {
        router.push(VIDEOS_PATH);
        return;
      }
      router.push(searchPath(text));
    },
    [router],
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
  const askMicPermission = useCallback(async (opts?: { thenListen?: boolean }): Promise<boolean> => {
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
      if (opts?.thenListen) {
        // 큰 버튼을 눌러서 온 경우: 곧바로 듣기 시작하므로 다시 누르라고 하지 않는다.
        // 안내를 다 읽은 뒤에 듣기 시작해야 앱의 말이 마이크로 들어가 명령으로 오해되지 않는다
        const read = say("마이크를 허용했습니다. 알림음이 나면 말씀하세요.");
        if (speechEnabledRef.current) await read;
      } else {
        void say("마이크를 허용했습니다. 이제 큰 버튼을 누르고 말하세요.");
      }
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
          // 글로 물었으면 화면에만 띄우고, 말로 물었으면 말할 수 있는 말까지 읽어 준다
          if (quietRepliesRef.current) void say("사용법을 화면에 띄웠어요.");
          openGuide(!quietRepliesRef.current, true);
          return;
        case "ACCOUNT":
          goTo("/account", readSignedInAccount() ? "내 계정 화면입니다." : "로그인 화면입니다. 구글 계정이나 이메일로 로그인할 수 있어요. 처음이면 회원가입하기를 누르세요.");
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
        case "VIDEOS":
          goSearch("");
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
          // 운동하기 = 운동 고르기 (전체 운동 목록, 시안 D 흐름 A)
          goSearch("");
          return;
        case "SETTINGS":
          setSettingsOpen(true);
          void say("설정을 열었어요. 음성 안내, 읽기 속도, 글자 크기를 고를 수 있어요. 닫으려면 Esc를 누르세요.");
          return;
        case "SUPPLY":
          goTo("/my/contents", "콘텐츠 올리기 화면입니다. 새 콘텐츠를 만들려면 새 콘텐츠라고 말해 주세요.");
          return;
        case "NEW_CONTENT":
          goTo("/my/contents/new", "새 콘텐츠 만들기입니다. 운동 영상 파일을 고르고 분석 시작이라고 말해 주세요.");
          return;
        case "COURSES": {
          if (!intent.courseId || !readSignedInAccount()) {
            goTo("/courses", "어떤 강의를 들으셨나요? 하체, 코어, 상체, 스트레칭 중에서 말씀해 주세요.");
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
          noteStruggle();
          s.repeat();
          return;
        case "EXPLAIN": {
          // AI가 꺼져 있을 때: 지금 단계의 자세한 안내를 조금 천천히 다시 읽는다
          noteStruggle();
          const seg = exercise.segments[s.segmentIndex];
          if (!seg) return;
          if (s.playing) s.pause();
          const detail = seg.voiceGuide || seg.instruction || seg.title;
          void say(`천천히 다시 말씀드릴게요. ${detail} 준비되면 "계속"이라고 말해 주세요.`);
          return;
        }
      }
    },
    [askMicPermission, changeRate, exercise, exercises, goSearch, goTo, handleBack, handleHome, handleLogout, learned, mode, noteStruggle, openExercise, openGuide, say, setLearnedCourses, setMovementKnown, setTts, toggleTtsPause],
  );

  /**
   * 말로 화면을 바꾸라고 하면 먼저 묻는다 (docs/decisions/0012). 버튼을 누른 것은 묻지 않는다.
   * 화면을 바꾸는 말이 아니면(재생 조작, 설정 등) 바로 한다.
   */
  const navQuestion = useCallback(
    (intent: Intent): string | null => {
      switch (intent.type) {
        case "OPEN": {
          if (exercise?.id === intent.exerciseId) return null;
          const title = exercises?.find((e) => e.id === intent.exerciseId)?.title ?? "그 운동";
          return intent.autoplay ? `${eulReul(title)} 열고 바로 시작할까요?` : `${title} 화면으로 갈까요?`;
        }
        case "LIST":
          return `${intent.category ? EXERCISE_CATEGORY_LABELS[intent.category] : (intent.keyword ?? "찾은")} 운동 목록으로 갈까요?`;
        case "VIDEOS":
        case "CONSUME":
          return pathname === VIDEOS_PATH ? null : "운동 고르기로 갈까요?";
        case "SUPPLY":
          return mode === "supply" ? null : "콘텐츠 올리기로 갈까요?";
        case "NEW_CONTENT":
          return "새 콘텐츠 만들기로 갈까요?";
        case "ACCOUNT":
          return readSignedInAccount() ? "내 계정으로 갈까요?" : "로그인 화면으로 갈까요?";
        case "COURSES":
          return intent.courseId ? null : "내 강의로 갈까요?";
        case "HOME":
          return pathname === "/" ? null : "처음 화면으로 갈까요?";
        case "BACK":
          return "이전 화면으로 갈까요?";
        default:
          return null;
      }
    },
    [exercise, exercises, mode, pathname],
  );
  const runIntentAsking = useCallback(
    (intent: Intent, text = "") => {
      // 글로 입력했으면 화면을 보고 있는 사람이므로 버튼처럼 묻지 않고 바로 한다
      const question = quietRepliesRef.current ? null : navQuestion(intent);
      if (question) void ask(question, () => runIntent(intent, text), () => say("알겠어요. 여기 있을게요."));
      else runIntent(intent, text);
    },
    [ask, navQuestion, runIntent, say],
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
              noteStruggle();
              s.repeat();
              return;
          }
      }
    },
    [adjustRate, exercise, goSearch, handleBack, handleHome, noteStruggle, openExercise],
  );

  /** 에이전트의 답: 화면 이동·멈춤은 바로, 답을 읽고, 안내를 시작하는 조작은 답을 다 읽은 뒤에 한다 */
  const runAgentResponse = useCallback(
    async (response: AgentChatResponse, seq: number, early: StreamSpeaker | null = null) => {
      // 화면을 바꾸는 할 일은 대답을 읽은 뒤 먼저 묻는다 (docs/decisions/0012)
      const isNav = (a: AgentAction) => a.type === "SHOW_LIST" || a.type === "NAVIGATE" || (a.type === "OPEN_EXERCISE" && a.exerciseId !== exercise?.id);
      const nav = response.actions.filter(isNav);
      const { before, after } = splitAgentActions(response.actions.filter((a) => !isNav(a)));
      before.forEach(runAgentAction);
      const stopped = response.actions.some((a) => a.type === "PLAYBACK" && a.command === "STOP");
      const reply = response.reply || (stopped ? SAFETY_MESSAGE : "");
      // early: 답을 받는 대로 이미 앞부분을 읽기 시작했다. 남은 뒷부분만 이어서 읽는다
      if (reply) await say(reply, null, early ? { spoken: early.finish(reply) } : undefined);
      // 읽는 사이에 사용자가 다른 말을 했으면 미뤄 둔 조작은 하지 않는다
      if (seq !== commandSeqRef.current) return;
      after.forEach(runAgentAction);
      if (nav.length > 0) {
        // 여러 개면 하나만 묻고 그것만 한다 (운동 하나를 여는 것이 가장 구체적이라 먼저)
        const first = nav.find((a) => a.type === "OPEN_EXERCISE") ?? nav[0]!;
        // 글로 입력했으면 묻지 않고 바로 한다
        if (quietRepliesRef.current) {
          runAgentAction(first);
          return;
        }
        const question =
          first.type === "OPEN_EXERCISE"
            ? `${eulReul(exercises?.find((e) => e.id === first.exerciseId)?.title ?? "그 운동")} ${first.autoplay ? "열고 바로 시작할까요?" : "열까요?"}`
            : first.type === "SHOW_LIST"
              ? `${first.keyword ?? (first.category ? EXERCISE_CATEGORY_LABELS[first.category] : "찾은")} 운동 목록으로 갈까요?`
              : first.type === "NAVIGATE" && first.destination === "HOME"
                ? "처음 화면으로 갈까요?"
                : "이전 화면으로 갈까요?";
        void ask(question, () => runAgentAction(first), () => say("알겠어요. 여기 있을게요."));
      }
    },
    [ask, exercise, exercises, runAgentAction, say],
  );

  const handleCommand = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const seq = ++commandSeqRef.current;
      // 지금 말을 넣기 전의 대화를 에이전트에게 함께 보낸다
      const history: AgentTurn[] = logRef.current.map((m) => ({
        role: m.who === "me" ? "user" : "assistant",
        text: m.text,
      }));
      addMessage("me", text);
      setLastHeard(text);
      const intent = parseIntent(text, exercises ?? []);

      // 위험 신호는 어느 화면에서든 가장 먼저 처리한다
      if (intent.type === "SAFETY") {
        setPendingConfirm(null);
        setThinking(false);
        runIntent(intent);
        return;
      }
      // 사용법 안내가 떠 있으면 닫는다. "건너뛰기"처럼 그만 보겠다는 말이면 거기서 끝낸다
      if (guideRef.current) {
        closeGuide();
        if (isGuideSkip(text)) {
          setThinking(false);
          return;
        }
      }
      // 물어본 것에 대한 대답이면 그대로 한다 ("네", "아니")
      const pending = pendingConfirmRef.current;
      setPendingConfirm(null);
      if (pending) {
        const answer = classifyAnswer(text);
        if (answer === "yes") {
          setThinking(false);
          pending.yes();
          return;
        }
        if (answer === "no") {
          setThinking(false);
          if (pending.no) pending.no();
          else void say("알겠어요.");
          return;
        }
      }
      // 페이지에서만 쓰는 말 (예: 분석 시작, 검수 요청)
      if (pageCommandsRef.current?.(text)) {
        setThinking(false);
        return;
      }
      // 콘텐츠 올리기 화면에서는 운동 에이전트를 쓰지 않는다
      if (mode === "supply" || handleLocally(intent, text, exercise !== null)) {
        setThinking(false);
        runIntentAsking(intent, text);
        return;
      }

      setThinking(true);
      const s = sessionRef.current;
      if (intent.type === "EXPLAIN") noteStruggle();
      // 이 사람에 대해 아는 것과 지금 단계 안내를 함께 보낸다 (배운 말로, 어려워하는 동작은 쉽게)
      const profile = accountId ? learning : null;
      const recentIds = [...new Set(readHistory(accountId).slice(-10).reverse().map((h) => h.exerciseId))].slice(0, 3);
      const learner = {
        known: (profile?.movements ?? []).filter((m) => knowsMovement(profile, m.movementId)).map((m) => movementLabel(m.movementId)),
        hard: (profile?.movements ?? []).filter((m) => findsHard(profile, m.movementId)).map((m) => movementLabel(m.movementId)),
        recent: recentIds.map((id) => (exercises ?? []).find((e) => e.id === id)?.title).filter((t): t is string => !!t),
      };
      const currentSeg = exercise?.segments[s.segmentIndex];
      // 답이 오든, 실패하든, 끝내 오지 않든 한 번만 마무리한다. '답을 생각하고 있어요'에서 멈추지 않게 한다
      let settled = false;
      // 맞장구 (0019): 말로 물었는데 답이 조금 늦어지면 "잠시만요."처럼 짧게 말해 조용히 기다리게 하지 않는다.
      // 답은 맞장구를 다 읽은 뒤에 읽는다 (두 말이 겹치거나 맞장구가 잘리지 않게).
      let backchannelDone: Promise<unknown> | null = null;
      const backchannelTimer = window.setTimeout(() => {
        if (settled || seq !== commandSeqRef.current) return;
        // 글로 물었거나, 음성 안내를 껐거나, 사람이 아직 말하는 중이거나, 앱이 무언가 읽는 중이면 하지 않는다
        if (quietRepliesRef.current || !speechEnabledRef.current) return;
        if (Date.now() < userTalkingUntilRef.current || getSpeechState().speaking) return;
        const phrase = pickBackchannel(text);
        backchannelRef.current = { text: phrase, until: Date.now() + 3500 };
        backchannelDone = Promise.race([speak(phrase, { rate: rateRef.current }), new Promise((r) => window.setTimeout(r, BACKCHANNEL_MAX_MS))]);
      }, BACKCHANNEL_DELAY_MS);
      // 받는 대로 읽기 (0020): 답의 글자가 오는 대로, 읽을 만큼 모인 곳부터 읽기 시작한다.
      // 말로 물었을 때만, 그리고 할 일(화면 바꾸기·재생 조작)이 없는 답일 때만 한다. 할 일이 있으면 읽는 중에 화면이 바뀌지 않게 끝까지 받고 읽는다.
      let early: StreamSpeaker | null = null;
      let earlyAllowed = !quietRepliesRef.current && speechEnabledRef.current;
      const dropEarly = () => {
        if (!early) return;
        const wasReading = early.started();
        early.cancel();
        early = null;
        if (wasReading) stopSpeaking();
      };
      const speakEarly = async (chunk: string) => {
        // 맞장구를 읽는 중이면 다 읽은 뒤에 시작한다
        await (backchannelDone ?? Promise.resolve());
        if (seq !== commandSeqRef.current) return false;
        setThinking(false);
        return speak(chunk, { rate: rateRef.current });
      };
      const finish = (response: AgentChatResponse | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(giveUp);
        window.clearTimeout(backchannelTimer);
        void (backchannelDone ?? Promise.resolve()).then(() => {
          if (seq !== commandSeqRef.current) {
            early?.cancel();
            return;
          }
          setThinking(false);
          const reading = early?.started() ? early : null;
          if (response) void runAgentResponse(response, seq, reading);
          // 읽다가 연결이 끊겼다: 읽은 데서 멈춘다. 같은 말을 규칙으로 다시 처리하지 않는다
          else if (reading) reading.cancel();
          // 에이전트를 못 쓰면 규칙 기반 해석으로 처리한다
          else runIntentAsking(intent, text);
        });
      };
      const giveUp = window.setTimeout(() => finish(null), THINKING_MAX_MS);
      void agent
        .chatStream(
          {
          message: text,
          history,
          context: {
            screen: routeExerciseId ? "exercise" : pathname === "/search" ? "list" : "home",
            exerciseId: view.name === "exercise" ? view.exerciseId : null,
            sessionState: exercise ? s.state : null,
            segmentIndex: exercise ? s.segmentIndex : null,
            learner,
            ...(currentSeg ? { currentGuide: guideOf(currentSeg) || currentSeg.voiceGuide } : {}),
          },
          },
          {
            onText: (delta) => {
              if (settled || seq !== commandSeqRef.current) return;
              // 답이 오기 시작했다: 아직 하지 않은 맞장구는 하지 않고, 오래 걸린다고 포기하지도 않는다
              window.clearTimeout(backchannelTimer);
              window.clearTimeout(giveUp);
              if (!earlyAllowed) return;
              early ??= createStreamSpeaker(speakEarly);
              early.push(delta);
            },
            // 지금까지 온 글은 답이 아니었다 (도구를 부르기 전의 말). 읽기 시작했으면 멈춘다
            onReset: dropEarly,
            onActions: (actions) => {
              if (actions.length === 0) return;
              earlyAllowed = false;
              dropEarly();
            },
          },
        )
        .then(finish, () => finish(null));
    },
    [accountId, addMessage, agent, closeGuide, exercise, exercises, guideOf, learning, mode, noteStruggle, pathname, routeExerciseId, runAgentResponse, runIntentAsking, say, setPendingConfirm, view],
  );

  const handleCommandRef = useRef(handleCommand);
  handleCommandRef.current = handleCommand;

  // ── 부르면 듣기 (docs/decisions/0009) ──
  // 마이크를 켜 두고 "소리벗"이라고 부른 뒤의 말만 명령으로 받는다. 큰 버튼을 누르는 것은 부른 것과 같다.
  // 호출어 없이 들린 말(영상 속 강사의 말, 주변 소리)은 명령으로 받지 않는다.
  const gateRef = useRef(createCommandGate());
  const openMicRef = useRef(false);
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

  // 이어서 말하기: 명령을 처리하고 앱이 대답을 다 읽으면 알림음을 내고 다음 한 마디를 또 듣는다.
  // 그래서 "소리벗"은 처음 한 번만 부르면 된다. 정해진 시간 동안 말이 없으면 낮은 알림음과 함께 그만 듣는다.
  // 운동 영상이 재생 중이면 이어 듣지 않는다 (영상 소리를 계속 끄게 되므로). 그때는 다시 "소리벗"이라고 부른다.
  const followUpTimerRef = useRef<number | null>(null);
  const cancelFollowUp = () => {
    if (followUpTimerRef.current !== null) window.clearInterval(followUpTimerRef.current);
    followUpTimerRef.current = null;
  };
  const scheduleFollowUp = useCallback(() => {
    cancelFollowUp();
    const started = Date.now();
    let quietSince = 0;
    followUpTimerRef.current = window.setInterval(() => {
      const now = Date.now();
      if (armedRef.current || !listenerRef.current || sessionRef.current.playing || now - started > 60_000) {
        cancelFollowUp();
        return;
      }
      // 대답을 준비하는 동안(생각 중·읽는 중)은 기다린다. 명령 직후 대답이 시작되기 전의 잠깐은 넘긴다
      if (now - started < 700 || thinkingRef.current || getSpeechState().speaking) {
        quietSince = 0;
        return;
      }
      if (!quietSince) quietSince = now;
      else if (now - quietSince >= 400) {
        cancelFollowUp();
        arm();
      }
    }, 150);
  }, [arm]);

  const heard = useCallback(
    (text: string) => {
      // 말로 했으면 대답도 소리 내어 읽는다
      quietRepliesRef.current = false;
      // 앱이 방금 읽은 말이 스피커에서 다시 들어온 것이면 사람이 한 말이 아니다
      if (spokenEcho.isEcho(text)) return;
      // 방금 한 맞장구의 일부만 들린 것도 마찬가지다 (짧아서 위의 비교를 빠져나갈 수 있다)
      const backchannel = backchannelRef.current;
      if (backchannel && Date.now() < backchannel.until && isBackchannelEcho(text, backchannel.text)) return;
      // 운동 중(음성 안내 켬)에는 호출어 없이 바로 대화한다
      if (openMicRef.current) {
        const rest = afterWakeWord(text);
        if (rest === "") {
          arm();
          return;
        }
        cancelFollowUp();
        clearArmTimer();
        gateRef.current.disarm();
        armedRef.current = false;
        setArmed(false);
        setVoiceStatus(`들린 말: "${rest ?? text}"`);
        handleCommandRef.current(rest ?? text);
        return;
      }
      const r = gateRef.current.feed(text);
      if (!r) return;
      if (r.kind === "armed") {
        cancelFollowUp();
        arm();
        return;
      }
      clearArmTimer();
      armedRef.current = false;
      setArmed(false);
      setVoiceStatus(`들린 말: "${r.text}"`);
      handleCommandRef.current(r.text);
      if (listenerRef.current) scheduleFollowUp();
      else releaseListener();
    },
    [arm, releaseListener, scheduleFollowUp],
  );
  const heardRef = useRef(heard);
  heardRef.current = heard;

  /** 마이크 듣기를 켠다 (이미 켜져 있으면 그대로) */
  const ensureListener = useCallback((): boolean => {
    if (listenerRef.current) return true;
    const listener = startListening({
      onText: (text) => heardRef.current(text),
      // 더 이을 말이 없는 짧은 말("다음", 묻는 말에 "네")은 덜, 덜 끝난 것 같은 말은 더 기다린다 (0019)
      endOfSpeechMs: (heardSoFar) => endOfSpeechWaitMs(heardSoFar, { awaitingAnswer: pendingConfirmRef.current !== null, onExercise: exerciseOpenRef.current }),
      // 사람이 말하기 시작하면(앱의 메아리가 아니면) 앱이 읽던 말을 멈추고 듣는다. 듣는 동안 영상 소리도 끈다
      onSpeaking: (partial) => {
        if (spokenEcho.isEcho(partial) || partial.replace(/\s/g, "").length < 2) return;
        const conversing = openMicRef.current || armedRef.current || afterWakeWord(partial) !== null;
        if (!conversing) return;
        userTalkingUntilRef.current = Date.now() + 1500;
        if (getSpeechState().speaking) stopSpeaking();
      },
      onError: (error) => {
        // 잠깐 끊긴 것(failed)은 알아서 다시 듣는다. 알릴 것은 지원 안 함·권한 거부뿐
        if (error === "failed") return;
        setVoiceStatus(LISTEN_ERROR_TEXT[error]);
        if (error === "denied") setMic("denied");
        listenerRef.current = null;
        setListening(false);
      },
    });
    if (!listener) return false;
    listenerRef.current = listener;
    setListening(true);
    return true;
  }, []);

  // 운동 중에는 호출어 없이 듣는다 (음성 안내를 켰을 때, 시작한 뒤). 마이크가 허용돼 있어야 한다
  const openMic = routeExerciseId !== null && speech.enabled && session.started;
  openMicRef.current = openMic;
  useEffect(() => {
    if (openMic && mic === "granted") ensureListener();
    else if (!openMic && !wakeEnabledRef.current && !armedRef.current) stopListener();
  }, [ensureListener, mic, openMic, stopListener]);

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
    quietRepliesRef.current = false;
    cancelFollowUp();
    if (armedRef.current) {
      disarm(true);
      return;
    }
    // 아직 허용하지 않았으면 먼저 묻는다. 차단됐으면 다시 허용하는 방법을 알려 준다
    if (micRef.current !== "granted") {
      const ok = await askMicPermission({ thenListen: true });
      if (!ok) return;
    }
    if (!ensureListener()) return;
    arm();
  }, [arm, askMicPermission, disarm, ensureListener]);

  /** 말 대신 글로 입력: 쓴 말을 말한 것과 똑같이 처리한다 ("스쿼트 시작", "다음", "하체 운동 찾아줘") */
  const submitText = (e: FormEvent) => {
    e.preventDefault();
    const text = query.trim();
    if (!text) {
      void say("말 대신 쓸 말을 먼저 입력해 주세요.");
      return;
    }
    setQuery("");
    quietRepliesRef.current = true;
    stopSpeaking();
    handleCommand(text);
  };

  /** 묻는 말에 눌러서 대답하기: "네", "아니요"라고 말한 것과 같다 */
  const answerConfirm = (answer: "네" | "아니요") => {
    stopSpeaking();
    handleCommand(answer);
  };
  const confirmButtons = confirming ? (
    <div role="group" aria-label="대답하기" className="flex gap-3">
      <button type="button" onClick={() => answerConfirm("네")} className="min-h-[60px] flex-1 rounded-2xl bg-accent-grad px-5 text-[22px] font-extrabold text-bg">
        네
      </button>
      <button
        type="button"
        onClick={() => answerConfirm("아니요")}
        className="min-h-[60px] flex-1 rounded-2xl border-2 border-control bg-panel px-5 text-[22px] font-bold text-ink hover:border-ink-2"
      >
        아니요
      </button>
    </div>
  ) : null;

  const togglePlayRef = useRef<() => void>(() => {});
  togglePlayRef.current = () => togglePlay();
  const togglePlay = () => {
    if (session.playing) {
      stopSpeaking();
      session.pause();
      void say('잠시 멈췄어요. "계속"이라고 말하면 이어서 안내합니다.');
    } else {
      session.start();
    }
  };

  // ── 설정 창 (머리말의 톱니, "설정"이라고 말하기) ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    settingsButtonRef.current?.focus();
  }, []);
  /** 설정에서 고르면 닫고 그 화면으로 간다 */
  const fromSettings = (action: () => void) => {
    setSettingsOpen(false);
    action();
  };
  // 다른 화면으로 가면 닫는다
  useEffect(() => setSettingsOpen(false), [pathname]);
  // 운동 화면을 떠나면 한 줄 안내도 치운다
  useEffect(() => {
    if (routeExerciseId === null) setExerciseTip(false);
  }, [routeExerciseId]);

  /** 읽기 속도를 정해진 값으로 바꾼다 (설정 창의 느리게·보통·빠르게) */
  const setRateTo = useCallback(
    (value: number) => {
      const next = clampRate(value);
      rateRef.current = next;
      setRate(next);
      writePrefs({ rate: next });
      void say(`읽기 속도를 ${nearestChoice(RATE_CHOICES, next).label}로 바꿨어요.`);
    },
    [say],
  );
  const [fontScale, setFontScale] = useState(1);
  const changeFont = useCallback(
    (value: number) => {
      setFontScale(value);
      writePrefs({ font: value });
      void say(`글자 크기를 ${nearestChoice(FONT_CHOICES, value).label}로 바꿨어요.`);
    },
    [say],
  );

  const shellApi = useMemo<ShellApi>(
    () => ({
      account,
      accountReady,
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
      exercisesError: loadError,
      reloadExercises: () => void loadExercises(),
      levelOf,
      openExercise,
      shouldAnnounce: () => {
        const quiet = quietPageRef.current;
        quietPageRef.current = false;
        return !quiet;
      },
    }),
    [account, accountReady, accountId, exercises, learned, learning, levelOf, loadError, loadExercises, openExercise, refreshAccount, say, setLearnedCourses, setMovementKnown],
  );

  // ── 화면에 쓸 값 ──
  const isHome = pathname === "/";
  const isWatch = routeExerciseId !== null;
  const segmentTotal = exercise?.segments.length ?? 0;
  const currentSegment = exercise?.segments[session.segmentIndex] ?? null;
  const watchHeadline = exercise
    ? session.state === "COMPLETED"
      ? `${exercise.title} 마침`
      : session.started
        ? `${exercise.title} 안내 중`
        : `${exercise.title} 준비됨`
    : exerciseMissing
      ? "영상을 찾을 수 없어요"
      : "영상을 불러오는 중이에요";
  const pageHeadline = isWatch ? watchHeadline : (page?.title ?? "");
  const pageTitle = isHome ? "소리벗 — 말로 찾고, 듣고 따라 하는 운동" : pageHeadline ? `${pageHeadline} — 소리벗` : "소리벗";
  /** 화면 위 작은 글씨: 지금 어느 쪽(운동하기·콘텐츠 올리기)이고 누가 쓰는지 */
  const eyebrow = `${mode === "supply" ? "콘텐츠 올리기" : "운동하기"} · ${account ? `${account.name}님` : "로그인 전"}`;
  const coursesLabel = learned?.length ? learned.map(courseLabel).join(", ") : "없음";

  const ttsStatus = speech.paused ? "읽기를 잠시 멈췄습니다." : `읽는 중: ${lastSaid.length > 60 ? `${lastSaid.slice(0, 60)}…` : lastSaid}`;
  const ttsPauseLabel = speech.paused ? "이어서 읽기" : "읽기 잠시 멈춤";
  const showTtsControl = speech.speaking || speech.paused;

  /** 안내 상자: 앱이 방금 한 말 (말하는 중이면 표시) + 내가 한 말 */
  const guideBox = (
    <section aria-labelledby="guide-title" className="flex flex-col gap-2">
      <h2 id="guide-title" className="m-0 flex items-center gap-2 text-[16px] font-bold text-ink-3">
        안내
        {speech.speaking && (
          <span className="flex items-center gap-1.5 text-accent">
            <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
            말하는 중
          </span>
        )}
      </h2>
      <p
        className={`m-0 whitespace-pre-line rounded-2xl border-2 bg-bg px-5 py-4 text-[20px] leading-[1.55] ${
          speech.speaking ? "border-accent shadow-[0_0_0_3px_rgba(220,243,95,0.18)]" : "border-control"
        }`}
      >
        {lastSaid}
      </p>
      {confirmButtons}
      <p className="m-0 text-[16px] text-ink-3">내가 한 말: {lastHeard ?? "아직 없음"}</p>
    </section>
  );

  /**
   * 말로 하기: 큰 「눌러서 말하기」 → 상태 → 말 대신 글로 입력.
   * 시작 화면에서는 가운데 크게, 다른 화면에서는 오른쪽 패널에 둔다. 좁은 화면에서는 말하기 버튼만 화면 아래에 붙는다.
   */
  const speakPanel = (
    <section id="voice" aria-label="말로 하기" className="flex flex-col gap-5">
      {!isHome && <h2 className="m-0 text-[20px] font-extrabold">말로 하기</h2>}
      <div className="flex flex-col gap-2 max-[960px]:fixed max-[960px]:inset-x-0 max-[960px]:bottom-0 max-[960px]:z-30 max-[960px]:border-t-2 max-[960px]:border-line max-[960px]:bg-panel max-[960px]:px-4 max-[960px]:pb-4 max-[960px]:pt-2.5">
        {showTtsControl && (
          <button
            type="button"
            onClick={toggleTtsPause}
            aria-pressed={speech.paused}
            className="hidden min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-[3px] border-info bg-bg text-[20px] font-extrabold text-info max-[960px]:flex"
          >
            <Icon d={speech.paused ? ICONS.play : ICONS.pause} size={22} />
            <span>{ttsPauseLabel}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => void pressToTalk()}
          aria-pressed={armed}
          className={`flex w-full items-center justify-center gap-4 rounded-3xl font-extrabold text-bg ${isHome ? "min-h-[120px] text-[30px]" : "min-h-[96px] text-[26px]"} max-[960px]:min-h-[84px] max-[960px]:text-[24px] ${
            armed ? "bg-accent-hover shadow-[0_0_0_6px_rgba(220,243,95,0.35)]" : "bg-accent-grad"
          }`}
        >
          <MicIcon />
          <span>{armed ? "듣는 중 · 말씀하세요" : "눌러서 말하기"}</span>
        </button>
        <p role="status" className={`m-0 text-[16px] text-ink-3 max-[960px]:text-center ${isHome ? "text-center" : ""}`}>
          {thinking
            ? `${lastHeard ? `“${lastHeard}” · ` : ""}${thinkingSlow ? "답이 조금 늦어지고 있어요. 잠시만 기다려 주세요…" : "답을 생각하고 있어요…"}`
            : armed
              ? voiceStatus
              : openMicRef.current && listening
                ? "운동 중에는 바로 말하면 들어요. 말을 마칠 때까지 기다릴게요"
                : wakeEnabled && listening
                ? `위의 큰 버튼을 누르거나 “${WAKE_WORD}”라고 부르고 말하세요`
                : "위의 큰 버튼을 누르고 말하세요"}
        </p>
      </div>

      {mic !== null && mic !== "granted" && micPermissionText(mic).canRequest && (
        <p className={`m-0 text-[16px] text-ink-3 ${isHome ? "text-center" : ""}`}>
          마이크 권한: {micPermissionText(mic).label}.{" "}
          <button type="button" onClick={() => void askMicPermission()} className="font-bold text-info underline decoration-2 underline-offset-[5px] hover:text-info-light">
            {mic === "denied" ? "다시 허용하는 방법 듣기" : "마이크 사용 허용하기"}
          </button>
        </p>
      )}

      <form onSubmit={submitText} className="flex flex-col gap-2.5">
        <label htmlFor="say-text" className="text-[18px] font-bold">
          말 대신 글로 입력
        </label>
        <div className={`flex gap-3 ${isHome ? "max-[520px]:flex-col" : "flex-col"}`}>
          <input
            id="say-text"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isWatch ? "예: 다음" : "예: 스쿼트 시작"}
            autoComplete="off"
            className={`${INPUT_CLASS} flex-1`}
          />
          <Button type="submit" tone="inverse" icon={ICONS.send} block={!isHome} className={isHome ? "px-7" : ""}>
            보내기
          </Button>
        </div>
      </form>
    </section>
  );

  // ── 시청 화면 ──
  const watchPlayLabel = session.playing ? "멈춤" : session.started && session.state === "PAUSED" ? "계속" : "시작";
  const watchBody = exercise && (
    <>
      {/* 진행 막대: 시작하면 몇 단계째인지 보인다 */}
      {session.started && (
        <section aria-labelledby="progress-title" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="progress-title" className="m-0 text-[20px] font-extrabold">
              전체 단계
            </h2>
            <span className="text-[18px] font-bold tabular-nums">
              <span className="text-accent">{session.segmentIndex + 1}</span> / {segmentTotal}
            </span>
          </div>
          <ol className="m-0 grid list-none gap-3 p-0" style={{ gridTemplateColumns: `repeat(${Math.min(segmentTotal, 6)}, minmax(0, 1fr))` }}>
            {exercise.segments
              .map((seg, i) => ({ seg, i }))
              .filter(({ i }) => segmentTotal <= 6 || Math.abs(i - Math.min(Math.max(session.segmentIndex, 2), segmentTotal - 4)) <= 3)
              .slice(0, 6)
              .map(({ seg, i }) => {
                const state = i < session.segmentIndex ? "done" : i === session.segmentIndex ? "now" : "todo";
                return (
                  <li key={seg.id} className="flex min-w-0 flex-col gap-1.5" aria-current={state === "now" ? "step" : undefined}>
                    <span className={`h-1.5 rounded-full ${state === "done" ? "bg-accent-active/70" : state === "now" ? "bg-accent" : "bg-line"}`} />
                    <span className={`truncate text-[15px] ${state === "now" ? "font-bold text-accent" : "text-ink-3"}`}>
                      {i + 1}. {seg.title}
                    </span>
                  </li>
                );
              })}
          </ol>
        </section>
      )}

      {/* 지금 단계 카드: 영상(없으면 안내) + 지금 단계 이름과 안내. 시작 전에는 숨겨 두고 전체 단계 목록을 보여 준다 */}
      <section hidden={!session.started} aria-label="지금 단계" className="overflow-hidden rounded-[24px] border-[3px] border-accent bg-panel">
        <div className="relative bg-black">
          {videoUrl ? (
            <video ref={videoRef} src={videoUrl} controls playsInline preload="metadata" className="aspect-video w-full" aria-label={`${exercise.title} 영상`} />
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(ellipse_at_center,rgba(220,243,95,0.12),transparent_60%)] px-6 text-center">
              <p className="m-0 text-[22px] font-bold">이 운동은 영상 없이 소리로 안내해요</p>
              <p className="m-0 text-[18px] text-ink-2">시간에 맞춰 단계 안내를 들려 드려요.</p>
            </div>
          )}
          <button
            type="button"
            onClick={togglePlay}
            className="absolute right-4 top-4 flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-ink bg-bg/85 px-4 text-[17px] font-bold text-ink hover:border-accent"
          >
            <Icon d={session.playing ? ICONS.pause : ICONS.play} size={20} />
            {session.playing ? "동작 멈춤" : "동작 계속"}
          </button>
        </div>
        {currentSegment && (
          <div className="flex flex-col gap-2 px-6 py-5">
            <p className="m-0 text-[17px] font-bold text-accent">
              {session.segmentIndex + 1}단계 · {session.state === "COMPLETED" ? "끝" : "지금"}
            </p>
            <h2 className="m-0 text-[30px] font-extrabold leading-tight">{currentSegment.title}</h2>
            <p className="m-0 text-[20px] leading-[1.6] text-ink">{guideOf(currentSegment) || "이 단계는 영상 소리 그대로 따라 해요."}</p>
            {guideFor(currentSegment).reason && <p className="m-0 text-[16px] text-ink-3">{guideFor(currentSegment).reason}</p>}
          </div>
        )}
      </section>

      {!session.started && (
        <Section id="steps-title" title="전체 단계">
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {exercise.segments.map((seg, i) => {
              const current = i === session.segmentIndex;
              const g = guideFor(seg);
              return (
                <li key={seg.id}>
                  <ListButton
                    icon={current ? ICONS.speaker : ICONS.dot}
                    title={`${i + 1}단계. ${seg.title}`}
                    mark={current ? " (지금)" : ""}
                    sub={`${g.text || "이 단계는 영상 소리 그대로 따라 해요."}${g.reason ? ` · ${g.reason}` : ""}`}
                    current={current}
                    currentKind="step"
                    onClick={() => session.goToSegment(i)}
                  />
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      {exercise.precautions.length > 0 && <Caution label="주의할 자세">{exercise.precautions.join(" ")}</Caution>}

      <p className="m-0 text-[17px] text-ink-3">
        {EXERCISE_CATEGORY_LABELS[exercise.category]} · {DIFFICULTY_LABELS[exercise.difficulty]} · {formatDuration(exercise.video.durationSec)} · {guideLevelLabel(exerciseLevel)} 안내
        {accountId && (guidesLoading ? " · AI가 내 동작에 맞춘 안내를 만드는 중" : guides?.generatedBy === "ai" ? " · AI 맞춤 안내" : " · 내 동작에 맞춘 안내")}
        {!speech.enabled ? " · 음성 안내 꺼짐(영상 소리 그대로)" : hasNarration(exercise.segments) ? " · 강사가 말하는 부분은 맞춤 안내로 대신 읽어요" : ""}
      </p>
    </>
  );

  /** 시청 화면 아래에 붙는 조작 막대: 이전 단계 · 시작/멈춤 · 다음 단계 · 다시 듣기 */
  const watchControls = exercise && (
    <nav
      aria-label="운동 조작"
      className="sticky bottom-4 z-20 grid w-full grid-cols-[1fr_1.4fr_1fr_auto] items-center gap-2 rounded-[28px] border-2 border-control bg-panel/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur max-[960px]:static max-[640px]:grid-cols-2 max-[640px]:shadow-none"
    >
      <button type="button" onClick={session.previous} className="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl text-[20px] font-bold text-ink hover:bg-hover">
        <Icon d={ICONS.prev} /> 이전 단계
      </button>
      <button type="button" onClick={togglePlay} className="flex min-h-[64px] items-center justify-center gap-2.5 rounded-2xl bg-accent-grad text-[22px] font-extrabold text-bg max-[640px]:order-first max-[640px]:col-span-2">
        <Icon d={session.playing ? ICONS.pause : ICONS.play} /> {watchPlayLabel}
      </button>
      <button type="button" onClick={session.next} className="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl text-[20px] font-bold text-ink hover:bg-hover">
        다음 단계 <Icon d={ICONS.next} />
      </button>
      <button
        type="button"
        onClick={() => {
          noteStruggle();
          session.repeat();
        }}
        className="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl border-l-2 border-line px-5 text-[20px] font-bold text-ink hover:bg-hover max-[640px]:col-span-2 max-[640px]:border-l-0"
      >
        <Icon d={ICONS.repeat} /> 다시 듣기
      </button>
    </nav>
  );

  return (
    <ShellContext.Provider value={shellApi}>
      <div className="flex min-h-dvh flex-col" style={fontScale !== 1 ? { zoom: fontScale } : undefined}>
        <title>{pageTitle}</title>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-3 focus:!text-bg">
          본문으로 건너뛰기
        </a>
        <a href="#voice" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-3 focus:!text-bg">
          말로 하기로 건너뛰기
        </a>
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>

        {/* ── 머리말: 로고 · 운동하기 · 콘텐츠 올리기 · 로그인/내 계정 · 음성 안내 · 설정 ── */}
        <header className="border-b-2 border-line">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
            <Brand />
            <nav aria-label="메뉴" className="ml-auto flex flex-wrap items-center gap-2.5">
              <HeaderTab
                current={pathname === VIDEOS_PATH || pathname === "/search" || isWatch}
                icon={ICONS.exercise}
                onClick={() => runIntent({ type: "VIDEOS" })}
              >
                운동하기
              </HeaderTab>
              <HeaderTab current={mode === "supply"} icon={ICONS.upload} onClick={() => runIntent({ type: "SUPPLY" })}>
                콘텐츠 올리기
              </HeaderTab>
              <HeaderIcon
                tone="info"
                icon={account ? ICONS.logout : ICONS.login}
                label={account ? `내 계정 (${account.name}님)` : "로그인"}
                current={pathname === "/account" || pathname === "/login"}
                onClick={() => runIntent({ type: "ACCOUNT" })}
              />
              <HeaderIcon
                tone="info"
                icon={speech.enabled ? ICONS.speaker : ICONS.speakerOff}
                label={`음성 안내 ${speech.enabled ? "켜짐" : "꺼짐"}`}
                pressed={speech.enabled}
                onClick={() => setTts(!speech.enabled)}
              />
              <HeaderIcon
                ref={helpButtonRef}
                tone="ink"
                icon={ICONS.help}
                label="사용법"
                expanded={guide !== null}
                onClick={() => (guide ? closeGuide() : openGuide(true))}
              />
              <HeaderIcon
                ref={settingsButtonRef}
                tone="ink"
                icon={settingsOpen ? ICONS.close : ICONS.gear}
                label="설정"
                expanded={settingsOpen}
                onClick={() => setSettingsOpen((v) => !v)}
              />
            </nav>
          </div>
        </header>

        <main id="main" className="mx-auto box-border flex w-full max-w-[1280px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 max-[960px]:pb-10 max-[960px]:pt-6">
          {isHome ? (
            // ── 홈: 가운데에 질문 · 안내 · 말하기 · 글로 입력 ──
            <section aria-labelledby="home-title" className="mx-auto my-auto flex w-full max-w-[720px] flex-col gap-7 py-6 max-[960px]:my-0">
              <div className="flex flex-col items-center gap-4 text-center">
                <span className="rounded-full border-2 border-control bg-panel px-4 py-1 text-[16px] font-bold text-ink-2">{eyebrow}</span>
                <h1 id="home-title" ref={headingRef} tabIndex={-1} className="m-0 text-[48px] font-extrabold leading-tight tracking-[-0.5px] max-[960px]:text-[32px]">
                  어떤 운동을 할까요?
                </h1>
              </div>
              <p className="m-0 whitespace-pre-line rounded-2xl border-2 border-control bg-panel px-5 py-4 text-[20px] leading-[1.55]">{lastSaid}</p>
              {confirmButtons}
              {speakPanel}
              <p className="m-0 text-center text-[17px] text-ink-3">
                운동 목록은 화면 위 <b className="text-ink">운동하기</b> 버튼에 있습니다. “운동 목록”이라고 말해도 열립니다.
              </p>
            </section>
          ) : (
            // ── 다른 화면: 왼쪽 본문 + 오른쪽 말로 하기 ──
            <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-10 max-[960px]:grid-cols-1">
              <div className="flex min-w-0 flex-col gap-7">
                <div className="flex flex-col gap-1.5">
                  <p className="m-0 text-[16px] font-bold text-accent">{eyebrow}</p>
                  <h1 ref={headingRef} tabIndex={-1} className="m-0 text-[40px] font-extrabold leading-tight tracking-[-0.5px] max-[960px]:text-[30px]">
                    {pageHeadline}
                  </h1>
                </div>
                {!isWatch && guideBox}
                {isWatch && exerciseTip && (
                  <div className="flex items-start gap-3 rounded-2xl border-2 border-info bg-panel px-[18px] py-4">
                    <p className="m-0 flex-1 text-[18px] leading-[1.55] text-ink">
                      <span className="font-bold text-info">처음이라면.</span> {EXERCISE_TIP}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExerciseTip(false)}
                      aria-label="이 안내 닫기"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-control bg-bg text-ink hover:border-accent hover:bg-hover"
                    >
                      <Icon d={ICONS.close} size={22} />
                    </button>
                  </div>
                )}
                {isWatch && watchBody}
                {isWatch && watchControls}
                {isWatch && (
                  <p className="m-0 text-[15px] text-ink-3">
                    키보드: 스페이스 시작·멈춤 · ← → 이전·다음 단계 · R 다시 듣기. 운동 중에는 "소리벗" 없이 바로 말해도 들어요.
                  </p>
                )}
                {exerciseMissing && <p className="m-0 text-ink-2">공개가 끝났거나 주소가 잘못되었어요. 화면 위 운동하기에서 다시 골라 주세요.</p>}
                {!shellRoute && children}
              </div>
              <aside aria-label="안내와 말로 하기" className="sticky top-6 flex flex-col gap-6 rounded-[24px] border-2 border-control bg-panel p-6 max-[960px]:static">
                {isWatch && guideBox}
                {speakPanel}
              </aside>
            </div>
          )}
        </main>

        {/* ── 음성 읽기 조작 (넓은 화면, 읽는 동안 화면 아래에 붙는다. 시청 화면은 조작 막대가 있어 띄우지 않는다) ── */}
        {showTtsControl && !isWatch && (
          <div role="region" aria-label="음성 읽기 조작" className="sticky bottom-0 border-t-[3px] border-info bg-panel px-4 py-3 max-[960px]:hidden">
            <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-5 gap-y-3">
              <span className="min-w-0 flex-[1_1_240px] text-[18px] text-ink-2">{ttsStatus}</span>
              <button
                type="button"
                onClick={toggleTtsPause}
                aria-pressed={speech.paused}
                className="flex min-h-[60px] flex-[1_1_280px] items-center justify-center gap-2.5 rounded-2xl border-[3px] border-info bg-bg text-[21px] font-extrabold text-info hover:bg-info-tint"
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

        <SettingsDialog
          open={settingsOpen}
          onClose={closeSettings}
          speechEnabled={speech.enabled}
          onSpeech={(on) => {
            if (on !== speech.enabled) setTts(on);
          }}
          rate={rate}
          onRate={setRateTo}
          wakeEnabled={wakeEnabled}
          wakeWord={WAKE_WORD}
          onWake={(on) => {
            if (on !== wakeEnabled) setWakeEnabled(on);
          }}
          fontScale={fontScale}
          onFont={changeFont}
          askSteps={askSteps}
          onAskSteps={(on) => {
            if (on === askSteps) return;
            askStepsRef.current = on;
            setAskSteps(on);
            writePrefs({ askSteps: on });
            void say(on ? "단계가 끝날 때마다 넘어갈지 물어볼게요." : "단계가 끝나면 묻지 않고 바로 넘어갈게요.");
          }}
          accountName={account?.name ?? null}
          coursesLabel={coursesLabel}
          isAdmin={!!account?.adminRole}
          onLogin={() => fromSettings(() => runIntent({ type: "ACCOUNT" }))}
          onCourses={() => fromSettings(() => runIntent({ type: "COURSES", courseId: null, learned: true }))}
          onAccount={() => fromSettings(() => router.push("/account"))}
          onAdmin={() => fromSettings(() => router.push("/admin"))}
          onLogout={() => fromSettings(handleLogout)}
          onGuide={() => fromSettings(() => openGuide(true))}
        />
        <GuideDialog
          open={guide !== null}
          first={guide === "first"}
          speechEnabled={speech.enabled}
          speaking={guideSpeaking}
          onListen={() => listenGuide(false)}
          onClose={closeGuide}
        />
      </div>
    </ShellContext.Provider>
  );
}

/** 머리말의 쪽 탭 (운동하기 · 콘텐츠 올리기). 지금 쪽이면 네온 그린 바탕 + aria-current */
function HeaderTab({ current, icon, onClick, children }: { current: boolean; icon: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={`flex min-h-[52px] items-center gap-2 whitespace-nowrap rounded-[14px] border-[3px] px-4 text-[18px] font-bold ${
        current ? "border-accent bg-accent-grad text-bg" : "border-control bg-bg text-ink hover:border-accent hover:bg-hover"
      }`}
    >
      <Icon d={icon} size={22} />
      <span>{children}</span>
    </button>
  );
}

/** 머리말의 아이콘 버튼 (로그인 · 음성 안내 · 설정). 글자가 화면에 없으므로 aria-label과 title로 알린다 */
const HeaderIcon = forwardRef<
  HTMLButtonElement,
  { tone: "info" | "ink"; icon: string; label: string; current?: boolean; pressed?: boolean; expanded?: boolean; onClick: () => void }
>(function HeaderIcon({ tone, icon, label, current, pressed, expanded, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-current={current ? "page" : undefined}
      aria-pressed={pressed}
      aria-expanded={expanded}
      className={`flex h-[52px] w-[52px] items-center justify-center rounded-[14px] border-[3px] bg-bg ${
        current || expanded ? "border-accent text-accent" : tone === "info" ? "border-info text-info hover:bg-info-tint" : "border-ink text-ink hover:border-accent hover:bg-hover"
      }`}
    >
      <Icon d={icon} />
    </button>
  );
});
