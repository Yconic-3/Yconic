/**
 * 묻고 기다리기 (docs/decisions/0012): 단계를 넘기거나 화면을 바꾸기 전에 묻고, 사람의 대답을 알아듣는다.
 * "네/다음/좋아"는 그렇게 하자는 뜻, "아니/잠깐/그만"은 하지 말자는 뜻. 그 밖의 말은 대답이 아니다(null).
 */

const NO = ["아니", "아뇨", "싫어", "그만", "잠깐", "됐어", "취소", "나중에", "안 할", "안 해", "말고", "기다려", "멈춰"];
const YES = ["네", "예", "응", "어 ", "그래", "좋아", "좋습니다", "오케이", "ok", "가자", "가 줘", "가줘", "넘어가", "다음", "계속", "시작", "해 줘", "해줘", "할게", "할래", "그렇게", "물론", "맞아"];

export type Answer = "yes" | "no" | null;

/** 짧은 대답만 대답으로 본다 (긴 말은 새 질문이나 명령일 수 있다) */
export function classifyAnswer(raw: string): Answer {
  const text = ` ${raw.trim().toLowerCase().replace(/[.!?~,]/g, " ")} `;
  if (text.trim().length === 0 || text.trim().length > 14) return null;
  if (NO.some((w) => text.includes(w))) return "no";
  if (text.trim() === "어" || text.trim() === "웅" || text.trim() === "yes") return "yes";
  if (YES.some((w) => text.includes(w))) return "yes";
  return null;
}
