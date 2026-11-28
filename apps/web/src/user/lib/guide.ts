/**
 * 처음 한 번 사용법 안내 (docs/decisions/0013).
 * - 처음 온 사람에게만 짧은 사용법을 보여 주고 읽어 준다. 본 것은 이 브라우저에 기억한다
 * - 그 뒤로는 "사용법 알려줘"라는 말, 머리말의 물음표 버튼, 설정에서만 다시 연다
 * - 긴 설명을 처음에 몰지 않고, 필요한 순간에 한 줄씩 한 번만 알려 준다 (예: 운동을 처음 열 때)
 */

export const GUIDE_KEY = "yconic.guide";

/** 필요한 순간에 한 번만 알려 주는 한 줄 안내 */
export const TIP_IDS = ["exercise"] as const;
export type TipId = (typeof TIP_IDS)[number];

export interface GuideSeen {
  /** 처음 사용법 안내를 봤는지 */
  intro: boolean;
  /** 이미 알려 준 한 줄 안내 */
  tips: TipId[];
}

const NOTHING_SEEN: GuideSeen = { intro: false, tips: [] };

/** 저장된 글을 읽는다. 비었거나 망가졌으면 아무것도 안 본 것으로 본다 */
export function parseGuideSeen(raw: string | null): GuideSeen {
  if (!raw) return NOTHING_SEEN;
  try {
    const v = JSON.parse(raw) as { intro?: unknown; tips?: unknown } | null;
    if (!v || typeof v !== "object") return NOTHING_SEEN;
    const tips = Array.isArray(v.tips) ? TIP_IDS.filter((id) => (v.tips as unknown[]).includes(id)) : [];
    return { intro: v.intro === true, tips };
  } catch {
    return NOTHING_SEEN;
  }
}

export function readGuideSeen(): GuideSeen {
  try {
    return parseGuideSeen(window.localStorage.getItem(GUIDE_KEY));
  } catch {
    // 저장소를 못 쓰는 브라우저(시크릿 창 등)에서는 매번 처음으로 본다
    return NOTHING_SEEN;
  }
}

function write(seen: GuideSeen) {
  try {
    window.localStorage.setItem(GUIDE_KEY, JSON.stringify(seen));
  } catch {
    // 저장하지 못해도 이번 화면에서는 그대로 쓴다
  }
}

export function markIntroSeen() {
  const seen = readGuideSeen();
  if (!seen.intro) write({ ...seen, intro: true });
}

export function markTipSeen(id: TipId) {
  const seen = readGuideSeen();
  if (!seen.tips.includes(id)) write({ ...seen, tips: [...seen.tips, id] });
}

/** 화면에 보여 주는 사용법 세 가지 */
export const GUIDE_STEPS: readonly { title: string; body: string }[] = [
  {
    title: "말로 시키기",
    body: "화면 아래 큰 버튼을 누르고 운동 이름을 말하세요. 예: “스쿼트 시작”, “하체 운동 찾아줘”. 마이크를 써도 되는지 물으면 허용을 누르세요.",
  },
  {
    title: "운동 중에는",
    body: "“다음”, “다시”, “멈춰”라고 말하면 됩니다. 앱이 “넘어갈까요?”처럼 물으면 “네”, “아니요”로 답하거나 버튼을 누르세요.",
  },
  {
    title: "말하지 않고 쓰기",
    body: "말 대신 글로 입력해도 되고, 화면 위 ‘운동하기’에서 영상을 눌러 골라도 됩니다. 음성 안내는 화면 위 스피커 버튼으로 끌 수 있어요.",
  },
];

/** 다시 보는 방법 (화면용) */
export const GUIDE_AGAIN = "이 안내는 화면 위 물음표 버튼을 누르거나 “사용법 알려줘”라고 말하면 다시 볼 수 있어요.";

/** 소리로 읽어 주는 사용법. 화면의 세 가지와 같은 내용을 짧게 */
export const GUIDE_SPEECH_BODY =
  "소리벗 사용법을 알려 드릴게요. 하나, 화면 아래 큰 버튼을 누르고 운동 이름을 말하세요. 예를 들면, 스쿼트 시작. 둘, 운동 중에는 다음, 다시, 멈춰라고 말하면 됩니다. 셋, 앱이 물어보면 네 또는 아니요로 답하세요. 이 안내는 사용법 알려줘라고 말하면 다시 들을 수 있어요.";
export const GUIDE_SPEECH_END = "이제 큰 버튼을 누르고 말해 보세요.";

/** 운동 화면을 처음 열 때 한 번만 알려 주는 말 */
export const EXERCISE_TIP = "운동 중에는 “다음”, “다시”, “멈춰”라고 말할 수 있어요. 어려우면 “어려워요”라고 말해 보세요. 더 쉽게 알려 드려요.";

const SKIP_WORDS = ["건너뛰", "건너 뛰", "넘어가", "닫아", "닫기", "그만", "됐어", "알겠", "알았"];

/** 사용법 안내가 떠 있을 때 그만 보겠다는 말인지 */
export function isGuideSkip(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 12 && SKIP_WORDS.some((w) => t.includes(w));
}
