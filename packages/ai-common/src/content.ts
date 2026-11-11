import type { ClaudeContentBlock, ClaudeToolUseBlock } from "./claude";

/** 마지막 fallback 블록보다 앞에 있으면 되돌려 보내지 않는 블록 */
const DROP_BEFORE_FALLBACK = new Set(["thinking", "redacted_thinking", "connector_text", "tool_use"]);

/**
 * 도구를 쓰는 대화에서 모델의 답을 다음 요청에 되돌려 보낼 모양으로 고른다.
 * 거절로 대체 모델이 이어 답했으면, 마지막 fallback 블록 앞의 생각·도구 호출 블록은 빼야 한다
 * (Anthropic 문서 "Refusals and fallback — Continuing the conversation").
 * 대체가 없었으면 받은 그대로다. 도구 실행도 이 결과에 남은 tool_use만 한다.
 */
export function echoableContent(content: ClaudeContentBlock[]): ClaudeContentBlock[] {
  let lastFallback = -1;
  content.forEach((b, i) => {
    if (b.type === "fallback") lastFallback = i;
  });
  if (lastFallback < 0) return content;
  return content.filter((b, i) => i >= lastFallback || !DROP_BEFORE_FALLBACK.has(b.type));
}

export function toolUsesOf(content: ClaudeContentBlock[]): ClaudeToolUseBlock[] {
  return content.filter((b): b is ClaudeToolUseBlock => b.type === "tool_use");
}

/** 글 블록만 이어 붙인다 */
export function textOf(content: ClaudeContentBlock[]): string {
  return content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
}
