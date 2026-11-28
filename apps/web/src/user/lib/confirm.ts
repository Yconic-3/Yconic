/**
 * 묻고 기다리기 (docs/decisions/0012): 단계를 넘기거나 화면을 바꾸기 전에 묻고, 사람의 대답을 알아듣는다.
 * "네/다음/좋아"는 그렇게 하자는 뜻, "아니/잠깐/그만"은 하지 말자는 뜻. 그 밖의 말은 대답이 아니다(null).
 *
 * 대답이 아닌 말은 새 말로 처리된다. 그래서 새 요청을 대답으로 잘못 들으면 안 된다:
 * 앱이 "넘어갈까요?"라고 물었는데 사람이 "추천해 줘"라고 하면, 그것은 "네"가 아니라 새 요청이다.
 * 예전에는 "해 줘", "다음", "좋아" 같은 낱말이 들어 있기만 하면 "네"로 들어서,
 * "추천해 줘", "다음 운동 뭐야", "뭐가 좋아?"가 모두 "네"가 됐다.
 * 이제는 말 전체가 대답하는 낱말로만 이루어져 있을 때만 "네"로 듣는다.
 */

const NO = ["아니", "아뇨", "싫어", "그만", "잠깐", "됐어", "취소", "나중에", "안 할", "안 해", "말고", "기다려", "멈춰"];

/** 그러자는 낱말 */
const AFFIRM = new Set([
  "네", "넵", "넹", "네네", "예", "예예", "응", "응응", "어", "웅", "엉", "그래", "그럼", "좋아", "좋습니다", "좋지", "좋죠",
  "오케이", "오키", "ok", "okay", "yes", "y", "ㅇㅇ", "ㅇ", "물론", "물론이지", "물론이죠", "맞아", "당연하지", "당연하죠", "그러자", "그렇게", "콜",
]);
/** 그 일을 하라는 낱말 (물은 일을 그대로 하자는 뜻일 때) */
const ACTION = new Set([
  "해", "해줘", "하자", "할게", "할래", "하세요", "부탁해", "부탁드려", "부탁합니다", "부탁드립니다",
  "가", "가자", "가줘", "갈게", "갈래",
  "넘어가", "넘어가자", "넘어가줘", "넘어갈게", "넘어갈래", "넘겨", "넘겨줘",
  "시작", "시작해", "시작하자", "시작해줘", "시작할게", "시작할래",
  "다음", "다음으로", "계속", "계속해", "계속하자", "계속해줘", "계속할게",
  "열어", "열어줘", "틀어", "틀어줘", "돼", "됩니다", "해도", "가도", "넘어가도",
]);
/** 대답에 함께 붙는 말. 이것만으로는 대답이 아니다 */
const FILLER = new Set(["그거", "그걸로", "그대로", "바로", "지금", "이제", "얼른", "빨리", "어서", "한번", "그냥", "단계", "단계로", "걸로", "거", "그걸"]);

export type Answer = "yes" | "no" | null;

/** 띄어 쓴 "해 줘"·"가 줘"·"해 주세요"를 한 낱말로 붙인다 */
function joinRequests(text: string): string {
  return text.replace(/(해|가|넘어가|넘겨|열어|틀어|시작해|계속해)\s+(줘|주세요)/g, "$1$2");
}

/** 높임말을 예사말 꼴로 맞춘다: '~주세요' → '~줘', 끝의 '요'는 뗀다 (좋아요 → 좋아, 해줘요 → 해줘, 계속해주세요 → 계속해줘) */
function plain(word: string): string {
  if (word.length > 3 && word.endsWith("주세요")) return `${word.slice(0, -3)}줘`;
  return word.length > 1 && word.endsWith("요") && !word.endsWith("세요") ? word.slice(0, -1) : word;
}

/** 짧은 대답만 대답으로 본다 (긴 말은 새 질문이나 명령일 수 있다) */
export function classifyAnswer(raw: string): Answer {
  const text = ` ${raw.trim().toLowerCase().replace(/[.!?~,]/g, " ")} `;
  if (text.trim().length === 0 || text.trim().length > 14) return null;
  if (NO.some((w) => text.includes(w))) return "no";
  // 말 전체가 대답하는 낱말로만 이루어져 있어야 한다. 모르는 낱말이 하나라도 있으면 새 말이다
  const words = joinRequests(text.trim()).split(/\s+/).map(plain);
  let answered = false;
  for (const word of words) {
    if (AFFIRM.has(word) || ACTION.has(word)) answered = true;
    else if (!FILLER.has(word)) return null;
  }
  return answered ? "yes" : null;
}
