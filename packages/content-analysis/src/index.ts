/**
 * 영상 분석기. content-worker(지금은 API 서버의 작업기)와 웹앱 모의 모드가 함께 쓴다.
 * 실제 분석(프레임 추출 + 비전 모델)은 VideoAnalyzer 인터페이스를 구현해 바꿔 끼운다.
 */
import {
  DIFFICULTY_LABELS,
  EXERCISE_CATEGORY_LABELS,
  type DetectedSegment,
  type ExerciseCategory,
  type VideoAnalysisInput,
  type VideoAnalysisResult,
} from "@yconic/shared-types";

/**
 * 영상 분석기 인터페이스. content-worker가 실제 분석(프레임 추출 + 비전 모델)을 구현한다.
 * 관리자 웹의 모의 구현은 영상 내용을 보지 않고 길이만으로 구간을 나눈다.
 */
export interface VideoAnalyzer {
  analyze(input: VideoAnalysisInput): Promise<VideoAnalysisResult>;
}

interface ExerciseTemplate {
  title: string;
  instruction: string;
  voiceGuide: string;
  repetitions: number | null;
}

const TEMPLATES: Record<ExerciseCategory, ExerciseTemplate[]> = {
  STRETCHING: [
    {
      title: "목 옆으로 늘리기",
      instruction: "숨을 내쉬면서 목을 오른쪽으로 천천히 기울인다.",
      voiceGuide: "숨을 천천히 들이마십니다. 내쉬면서 오른쪽 귀를 오른쪽 어깨 쪽으로 천천히 기울입니다. 목 왼쪽이 당기는 느낌이 들면 멈추고 그대로 유지합니다.",
      repetitions: null,
    },
    {
      title: "반대쪽 늘리기",
      instruction: "가운데로 돌아온 뒤 왼쪽으로 같은 동작을 한다.",
      voiceGuide: "머리를 천천히 가운데로 돌아오게 합니다. 이번에는 왼쪽 귀를 왼쪽 어깨 쪽으로 천천히 기울입니다. 아프면 바로 힘을 빼세요.",
      repetitions: null,
    },
    {
      title: "어깨 돌리기",
      instruction: "양 어깨를 뒤로 크게 돌린다.",
      voiceGuide: "두 어깨를 귀 쪽으로 올렸다가 뒤로 크게 돌려 내립니다. 천천히 다섯 번 반복합니다.",
      repetitions: 5,
    },
  ],
  STRENGTH: [
    {
      title: "무릎 굽히기",
      instruction: "엉덩이를 뒤로 빼며 무릎을 천천히 굽혔다 편다.",
      voiceGuide: "의자 등받이를 잡은 채 엉덩이를 뒤로 빼면서 무릎을 천천히 굽힙니다. 발바닥으로 바닥을 밀면서 다시 일어섭니다.",
      repetitions: 10,
    },
    {
      title: "뒤꿈치 들기",
      instruction: "발뒤꿈치를 들어 올렸다 내린다.",
      voiceGuide: "두 발뒤꿈치를 천천히 들어 발끝으로 섭니다. 잠시 멈췄다가 천천히 내립니다.",
      repetitions: 10,
    },
  ],
  CARDIO: [
    {
      title: "제자리 걷기",
      instruction: "무릎을 가볍게 들어 올리며 제자리에서 걷는다.",
      voiceGuide: "제자리에서 걷기 시작합니다. 왼발, 오른발, 무릎을 가볍게 들어 올립니다. 숨이 편하게 쉬어지는 빠르기를 유지합니다.",
      repetitions: null,
    },
    {
      title: "팔 흔들며 걷기",
      instruction: "팔을 앞뒤로 크게 흔들며 걷는다.",
      voiceGuide: "걸으면서 두 팔을 앞뒤로 크게 흔듭니다. 어깨에 힘을 빼고 리듬을 유지합니다.",
      repetitions: null,
    },
  ],
  BALANCE: [
    {
      title: "한 발 들기",
      instruction: "오른발을 바닥에서 살짝 들어 버틴다.",
      voiceGuide: "왼발에 몸무게를 싣습니다. 오른발 뒤꿈치를 바닥에서 살짝 들어 버팁니다. 흔들리면 바로 발을 내려놓습니다.",
      repetitions: 3,
    },
    {
      title: "반대 발 들기",
      instruction: "왼발로 같은 동작을 한다.",
      voiceGuide: "이번에는 오른발에 몸무게를 싣고, 왼발 뒤꿈치를 살짝 들어 버팁니다.",
      repetitions: 3,
    },
  ],
  REHAB: [
    {
      title: "발목 돌리기",
      instruction: "발목을 천천히 원을 그리며 돌린다.",
      voiceGuide: "오른쪽 발끝으로 큰 원을 그리듯 발목을 천천히 돌립니다. 바깥쪽으로 다섯 번, 안쪽으로 다섯 번 돌립니다.",
      repetitions: 10,
    },
    {
      title: "반대쪽 발목 돌리기",
      instruction: "왼쪽 다리로 같은 동작을 한다.",
      voiceGuide: "오른쪽 다리를 내리고 왼쪽 다리를 앞으로 폅니다. 왼쪽 발목도 바깥쪽으로 다섯 번, 안쪽으로 다섯 번 돌립니다.",
      repetitions: 10,
    },
  ],
};

const INTRO_GUIDE = "운동을 시작합니다. 의자나 벽처럼 잡을 수 있는 것이 가까이 있는지 손으로 확인하고, 두 발을 어깨너비로 벌려 편하게 섭니다.";
const INTRO_GUIDE_SHORT = "운동을 시작합니다. 잡을 것이 가까이 있는지 확인하세요.";
const REST_GUIDE = "잠시 쉬어 갑니다. 숨을 고르고, 아프거나 어지러운 곳이 없는지 느껴 봅니다.";
const REST_GUIDE_SHORT = "잠시 쉬며 숨을 고릅니다.";
const OUTRO_GUIDE = "운동이 끝났습니다. 어깨에 힘을 빼고 코로 크게 숨을 들이마신 뒤 입으로 천천히 내쉽니다.";
const OUTRO_GUIDE_SHORT = "운동이 끝났습니다. 천천히 숨을 고르세요.";

/** 구간 길이 안에 읽을 수 있는 안내문을 고른다 (약 4글자/초) */
function fit(lengthSec: number, full: string, short: string): string {
  return full.length / 4 <= lengthSec ? full : short;
}

export const DEFAULT_PRECAUTIONS = [
  "운동 중 통증, 어지럼, 숨이 심하게 차는 느낌이 있으면 즉시 멈추고 쉬세요.",
  "넘어지지 않도록 주변에 부딪힐 물건이 없는 곳에서 하세요.",
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** 영상 길이만으로 준비 → (운동 → 휴식)… → 마무리 구간을 나눈다. */
export function planSegmentsByDuration(durationSec: number, category: ExerciseCategory): DetectedSegment[] {
  const templates = TEMPLATES[category];
  const d = durationSec;
  const seg = (kind: DetectedSegment["kind"], startSec: number, endSec: number, t: Omit<ExerciseTemplate, "repetitions"> & { repetitions: number | null }, confidence: number): DetectedSegment => ({
    kind,
    startSec: r1(startSec),
    endSec: r1(endSec),
    title: t.title,
    instruction: t.instruction,
    voiceGuide: t.voiceGuide,
    repetitions: t.repetitions,
    confidence,
  });

  if (d < 20) {
    return [seg("EXERCISE", 0, d, templates[0]!, 0.4)];
  }

  const introLen = clamp(Math.round(d * 0.15), 8, 18);
  const outroLen = clamp(Math.round(d * 0.12), 8, 15);
  const body = d - introLen - outroLen;
  const n = Math.max(1, Math.min(templates.length, Math.floor(body / 20)));
  const restLen = n > 1 ? clamp(Math.round(body * 0.1), 5, 12) : 0;
  const exLen = (body - restLen * (n - 1)) / n;

  const out: DetectedSegment[] = [];
  let t = 0;
  out.push(seg("INTRO", 0, introLen, { title: "준비", instruction: "바르게 서서 준비한다.", voiceGuide: fit(introLen, INTRO_GUIDE, INTRO_GUIDE_SHORT), repetitions: null }, 0.8));
  t = introLen;
  for (let i = 0; i < n; i++) {
    out.push(seg("EXERCISE", t, t + exLen, templates[i]!, 0.6));
    t += exLen;
    if (i < n - 1) {
      out.push(seg("REST", t, t + restLen, { title: "휴식", instruction: "잠시 쉰다.", voiceGuide: fit(restLen, REST_GUIDE, REST_GUIDE_SHORT), repetitions: null }, 0.7));
      t += restLen;
    }
  }
  out.push(seg("OUTRO", t, d, { title: "마무리", instruction: "심호흡하며 마무리한다.", voiceGuide: fit(d - t, OUTRO_GUIDE, OUTRO_GUIDE_SHORT), repetitions: null }, 0.8));
  return out;
}

/** 모의 분석기: 영상을 보지 않고 길이와 분류로 구간을 만든다. */
export function createMockAnalyzer(): VideoAnalyzer {
  return {
    async analyze(input) {
      const category = input.category as ExerciseCategory;
      const segments = planSegmentsByDuration(input.durationSec, category);
      const exerciseCount = segments.filter((s) => s.kind === "EXERCISE").length;
      return {
        provider: "mock",
        model: null,
        summary: `모의 분석: ${Math.round(input.durationSec)}초 영상을 운동 ${exerciseCount}개 구간으로 나눴습니다. 실제 분석기가 연결되면 영상 내용에 따라 구간과 설명이 정해집니다.`,
        suggestedTags: [EXERCISE_CATEGORY_LABELS[category], DIFFICULTY_LABELS[input.difficulty as keyof typeof DIFFICULTY_LABELS] ?? ""].filter(Boolean),
        suggestedPrecautions: [...DEFAULT_PRECAUTIONS],
        segments,
        warnings: ["모의 분석 결과입니다. 영상을 재생하면서 구간 시각과 안내문을 반드시 확인해 주세요."],
      };
    },
  };
}
