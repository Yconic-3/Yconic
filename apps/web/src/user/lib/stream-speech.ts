/**
 * 답을 받는 대로 읽기 (docs/decisions/0020).
 * AI의 답이 글자 단위로 들어오면, 다 올 때까지 기다리지 않고 읽을 만큼 모인 곳부터 읽는다.
 * - 문장이 끝난 곳(. ! ? 뒤에 띄어쓰기)에서 끊는다.
 * - 맨 처음 조각만은 쉼표에서도 끊는다. 첫 문장이 길면 문장이 끝나기를 기다리는 동안 조용하기 때문이다.
 *   그 뒤로는 문장 단위로만 끊는다 (자주 끊으면 말이 뚝뚝 끊겨 들린다).
 */

/** 첫 조각을 쉼표에서 끊을지. 끊어 읽는 것이 어색하게 들리면 false로 바꾼다 (그러면 늘 문장 단위로 읽는다) */
export const FIRST_CHUNK_AT_COMMA = true;
/** 쉼표에서 끊으려면 그 앞의 말이 이만큼(띄어쓰기 빼고)은 되어야 한다. 너무 짧은 조각("먼저,")은 끊지 않는다 */
export const MIN_FIRST_CLAUSE_CHARS = 10;

const SENTENCE_END = /[.!?…]["'”’)\]]?\s+/g;
const CLAUSE_END = /,\s+/g;

export interface Speakable {
  /** 지금 읽을 조각. 아직 읽을 만큼 모이지 않았으면 null */
  chunk: string | null;
  /** 조각으로 떼어 낸 원문 (뒤의 띄어쓰기까지) */
  consumed: string;
  /** 남은 글 */
  rest: string;
}

/** 모인 글에서 지금 읽을 조각을 떼어 낸다. first: 아직 아무것도 읽지 않았는지 */
export function takeSpeakable(buffer: string, opts: { first: boolean }): Speakable {
  // 끝난 문장이 여럿이면 한 번에 읽는다 (이음매를 줄인다)
  let end = -1;
  for (const m of buffer.matchAll(SENTENCE_END)) end = m.index + m[0].length;
  if (end < 0 && opts.first && FIRST_CHUNK_AT_COMMA) {
    for (const m of buffer.matchAll(CLAUSE_END)) {
      if (buffer.slice(0, m.index).replace(/\s/g, "").length >= MIN_FIRST_CLAUSE_CHARS) {
        end = m.index + m[0].length;
        break;
      }
    }
  }
  if (end < 0) return { chunk: null, consumed: "", rest: buffer };
  const consumed = buffer.slice(0, end);
  return { chunk: consumed.trim(), consumed, rest: buffer.slice(end) };
}

export interface StreamSpeaker {
  /** 새로 들어온 글자들. 읽을 만큼 모이면 읽기 시작한다 */
  push(delta: string): void;
  /** 읽기 시작했는지 */
  started(): boolean;
  /**
   * 다 받은 답으로 마무리한다: 아직 읽지 않은 뒷부분을 읽는다. 모두 끝까지 읽으면 true.
   * 받은 글과 끝난 답이 어긋나면(드문 경우) 더 읽지 않는다 (같은 말을 두 번 읽지 않게).
   */
  finish(full: string): Promise<boolean>;
  /** 그만둔다. 아직 읽지 않은 조각은 읽지 않는다 (읽고 있는 말을 멈추는 것은 부르는 쪽이 한다) */
  cancel(): void;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * speakOne: 조각 하나를 소리 내어 읽고, 끝까지 읽었으면 true를 주는 함수.
 * 조각은 차례로 읽는다. 하나가 끝까지 읽히지 못하면(사람이 말을 끊었다) 뒤의 조각은 읽지 않는다.
 */
export function createStreamSpeaker(speakOne: (text: string) => Promise<boolean>): StreamSpeaker {
  let pending = "";
  let handed = "";
  let count = 0;
  let cancelled = false;
  let chain: Promise<boolean> = Promise.resolve(true);

  function hand(chunk: string) {
    count++;
    chain = chain.then((ok) => (ok && !cancelled ? speakOne(chunk) : false)).catch(() => false);
  }

  return {
    push(delta) {
      if (cancelled) return;
      pending += delta;
      for (;;) {
        const next = takeSpeakable(pending, { first: count === 0 });
        if (!next.chunk) break;
        handed += next.consumed;
        pending = next.rest;
        hand(next.chunk);
      }
    },
    started: () => count > 0,
    finish(full) {
      if (cancelled) return Promise.resolve(false);
      const whole = squash(full);
      const done = squash(handed);
      pending = "";
      const rest = count === 0 ? whole : whole.startsWith(done) ? whole.slice(done.length).trim() : "";
      if (rest) hand(rest);
      return chain;
    },
    cancel() {
      cancelled = true;
      pending = "";
    },
  };
}
