/**
 * 메아리 거르기: 앱이 방금 소리 내어 읽은 말이 마이크로 다시 들어오면 사람이 한 말로 보지 않는다 (docs/decisions/0012).
 * 운동 중에는 호출어 없이 계속 듣기 때문에, 앱의 안내가 스피커에서 나와 다시 들리면 명령으로 오해할 수 있다.
 */

/** 띄어쓰기·문장 부호를 빼고 비교한다 */
function normalize(text: string): string {
  return text.replace(/[\s.,!?~"“”'‘’·…()]/g, "").toLowerCase();
}

/** 두 글자씩 묶은 조각 (한국어는 낱말보다 글자 조각이 잘 맞는다) */
function bigrams(text: string): Set<string> {
  const s = normalize(text);
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 들은 말의 글자 조각 중 앱이 한 말에도 있는 비율 (0~1) */
export function echoScore(heard: string, spoken: string): number {
  const h = bigrams(heard);
  if (h.size === 0) return normalize(spoken).includes(normalize(heard)) && normalize(heard).length > 0 ? 1 : 0;
  const s = bigrams(spoken);
  let hit = 0;
  for (const g of h) if (s.has(g)) hit++;
  return hit / h.size;
}

/** 이 비율 이상이면 메아리로 본다 */
export const ECHO_THRESHOLD = 0.6;

export interface EchoFilter {
  /** 앱이 소리 내어 읽기 시작한 말 */
  spoke(text: string, now?: number): void;
  /** 들은 말이 앱이 최근(windowMs 안)에 한 말의 메아리인지 */
  isEcho(heard: string, now?: number): boolean;
}

export function createEchoFilter(windowMs = 12_000): EchoFilter {
  let recent: { text: string; at: number }[] = [];
  return {
    spoke(text, now = Date.now()) {
      if (!text.trim()) return;
      recent = [...recent.filter((r) => now - r.at < windowMs), { text, at: now }];
    },
    isEcho(heard, now = Date.now()) {
      recent = recent.filter((r) => now - r.at < windowMs);
      if (normalize(heard).length < 2) return false;
      return recent.some((r) => echoScore(heard, r.text) >= ECHO_THRESHOLD);
    },
  };
}
