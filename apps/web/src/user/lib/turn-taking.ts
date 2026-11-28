import { handleLocally } from "./agent";
import { classifyAnswer } from "./confirm";
import { parseIntent } from "./intent";
import { END_OF_SPEECH_MS } from "./recognition";
import { afterWakeWord } from "./wake-word";

/**
 * 말 주고받기 (docs/decisions/0019): 언제 사람의 말이 끝났다고 볼지, 기다리게 할 때 무슨 말로 맞장구칠지.
 *
 * 빨리 답하는 것보다 말을 끊지 않는 것이 먼저다 (0012).
 * 그래서 기다리는 시간을 줄이는 것은 "더 이을 말이 없는 것이 분명한 짧은 말"뿐이고,
 * 말이 덜 끝난 것처럼 들리면 오히려 더 오래 기다린다. 그 밖의 말은 예전 그대로(1.3초) 기다린다.
 */

/** 더 이을 말이 없는 짧은 말을 들은 뒤 기다리는 시간 */
export const QUICK_WAIT_MS = 700;
/** 말이 덜 끝난 것처럼 들릴 때 기다리는 시간 */
export const UNFINISHED_WAIT_MS = 2000;
/** 이 글자 수(띄어쓰기 빼고)까지만 짧은 조작으로 본다 */
const QUICK_MAX_CHARS = 8;

export interface TurnContext {
  /** 앱이 무언가를 묻고 대답을 기다리는 중인지 ("넘어갈까요?") */
  awaitingAnswer: boolean;
  /** 운동 화면이 열려 있는지 */
  onExercise: boolean;
}

/** 말을 고르며 내는 소리. 이것으로 끝나면 아직 할 말이 남았다 */
const FILLERS = new Set(["음", "어", "아", "에", "그", "저", "저기", "그게", "그러니까", "그니까", "있잖아", "뭐지", "뭐더라", "뭐였지"]);
/** 말을 잇는 낱말. 이것으로 끝나면 뒤에 말이 더 온다 */
const CONNECTIVES = new Set(["그리고", "그런데", "근데", "그래서", "그러면", "그럼", "하지만", "아니면", "또", "다음에", "그다음에", "혹시", "만약에", "일단", "그리고나서"]);
/** 말을 잇는 끝소리 (…하고, …는데·…힘든데, …해서, …하면)와 조사 (…을, …는, …가). 문장은 보통 이것으로 끝나지 않는다 */
const UNFINISHED_ENDING = /(데|니까|지만|거나|다가|려고|하고|이랑|에서|한테|부터|까지|으로|고|서|면|랑|을|를|은|는|이|가)$/;

function lastWord(text: string): string {
  const words = text
    .replace(/[.,!?~…"'“”‘’]/g, " ")
    .trim()
    .split(/\s+/);
  return words[words.length - 1] ?? "";
}

/** 말이 덜 끝난 것처럼 들리는지 (잇는 말이나 조사로 끝났다) */
export function looksUnfinished(text: string): boolean {
  const word = lastWord(text);
  if (!word) return false;
  if (FILLERS.has(word) || CONNECTIVES.has(word)) return true;
  return word.length >= 2 && UNFINISHED_ENDING.test(word);
}

/**
 * 지금까지 들은 말 뒤로 얼마나 조용하면 말이 끝났다고 볼지 (밀리초).
 * - 호출어만 부름("소리벗"), 위험 신호("아파요"), 묻는 말에 대한 짧은 대답("네"), 화면이 바로 처리하는 짧은 조작("다음", "멈춰"): 짧게
 * - 잇는 말이나 조사로 끝남("스쿼트는", "하체 운동 하고"): 길게
 * - 그 밖의 말: 예전 그대로
 */
export function endOfSpeechWaitMs(raw: string, ctx: TurnContext): number {
  const rest = afterWakeWord(raw);
  if (rest === "") return QUICK_WAIT_MS;
  const text = (rest ?? raw).trim();
  const compact = text.replace(/[\s.,!?~…]/g, "");
  if (!compact) return END_OF_SPEECH_MS;

  const intent = parseIntent(text, []);
  if (intent.type === "SAFETY") return QUICK_WAIT_MS;
  if (ctx.awaitingAnswer && classifyAnswer(text) !== null) return QUICK_WAIT_MS;
  if (compact.length <= QUICK_MAX_CHARS && intent.type !== "UNKNOWN" && handleLocally(intent, text, ctx.onExercise)) return QUICK_WAIT_MS;
  if (looksUnfinished(text)) return UNFINISHED_WAIT_MS;
  return END_OF_SPEECH_MS;
}

// ── 맞장구: AI의 답을 기다리는 동안 조용하지 않게 ──

/** 답이 이만큼 늦어지면 짧게 맞장구친다. 그보다 빨리 오는 답은 바로 읽는다 */
export const BACKCHANNEL_DELAY_MS = 1000;
/** 맞장구를 다 읽기를 기다리는 가장 긴 시간. 읽기가 멈춰도 답이 밀리지 않게 한다 */
export const BACKCHANNEL_MAX_MS = 2000;

const QUESTION_WORDS = ["뭐", "무슨", "무엇", "어떻게", "어떤", "어느", "왜", "언제", "어디", "몇", "얼마", "누구"];
const QUESTION_ENDING = /(까|까요|나요|가요|ㄴ가요|인가요|야|니|죠|지|래|을까|할까)$/;

/** 묻는 말인지 (맞장구를 고를 때만 쓴다) */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (/[?？]$/.test(t)) return true;
  if (QUESTION_WORDS.some((w) => t.includes(w))) return true;
  return QUESTION_ENDING.test(lastWord(t));
}

/** 맞장구로 쓰는 말 모두 (서버 목소리를 쓸 때 미리 받아 둔다) */
export const BACKCHANNELS = ["확인해 볼게요.", "잠시만요."] as const;

/**
 * 기다리게 할 때 하는 짧은 말. 묻는 말에는 "확인해 볼게요.", 시키는 말에는 "잠시만요."
 * "네"처럼 대답으로 들릴 수 있는 말은 쓰지 않는다: 이 말이 스피커에서 마이크로 다시 들어오면 사람의 대답으로 잘못 들을 수 있다.
 */
export function pickBackchannel(text: string): string {
  return looksLikeQuestion(text) ? BACKCHANNELS[0] : BACKCHANNELS[1];
}

function squash(text: string): string {
  return text.replace(/[\s.,!?~…"'“”‘’]/g, "");
}

/**
 * 들은 말이 방금 한 맞장구가 마이크로 다시 들어온 것인지.
 * 메아리 거르기(echo.ts)는 두 글자 조각으로 비교해서 한 글자만 들린 경우를 놓친다. 맞장구는 짧아서 일부만 들리기 쉽다.
 */
export function isBackchannelEcho(heard: string, backchannel: string): boolean {
  const h = squash(heard);
  return h.length > 0 && squash(backchannel).includes(h);
}
