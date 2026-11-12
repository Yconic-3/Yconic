/** 한국어 조사 고르기. 마지막 글자에 받침이 있는지로 정한다 (한글이 아니면 받침 없음으로 본다) */
function hasFinalConsonant(word: string): boolean {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

/** 을/를 */
export function eulReul(word: string): string {
  return `${word}${hasFinalConsonant(word) ? "을" : "를"}`;
}

/** 으로/로 (받침이 없거나 ㄹ 받침이면 '로') */
export function euroRo(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  const jong = code >= 0 && code <= 11171 ? code % 28 : 0;
  return `${word}${jong === 0 || jong === 8 ? "로" : "으로"}`;
}

/** 이에요/예요 */
export function ieyo(word: string): string {
  return `${word}${hasFinalConsonant(word) ? "이에요" : "예요"}`;
}
