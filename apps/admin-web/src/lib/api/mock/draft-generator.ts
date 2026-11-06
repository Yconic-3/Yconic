import {
  DIFFICULTY_LABELS,
  EXERCISE_CATEGORY_LABELS,
  type ContentJob,
  type ExerciseCategory,
  type ExerciseContent,
  type ExerciseStep,
  type ISODateString,
} from "@yconic/shared-types";

type StepTemplate = Pick<ExerciseStep, "title" | "instruction" | "voiceGuide" | "durationSec" | "repetitions" | "restAfterSec">;

/**
 * 모의 AI 초안 생성기.
 * 실제로는 content-worker가 영상을 분석해 만든다. 여기서는 분류별 예시 단계를 돌려준다.
 */
const TEMPLATES: Record<ExerciseCategory, StepTemplate[]> = {
  STRETCHING: [
    {
      title: "준비 자세",
      instruction: "의자에 허리를 펴고 앉는다. 두 발은 바닥에, 손은 허벅지 위에 둔다.",
      voiceGuide: "의자에 허리를 펴고 앉습니다. 두 발바닥이 바닥에 닿게 하고, 두 손은 허벅지 위에 편하게 올려 둡니다.",
      durationSec: 15,
      repetitions: null,
      restAfterSec: 0,
    },
    {
      title: "천천히 늘리기",
      instruction: "숨을 내쉬면서 목을 오른쪽으로 천천히 기울인다.",
      voiceGuide: "숨을 천천히 들이마십니다. 내쉬면서 오른쪽 귀를 오른쪽 어깨 쪽으로 천천히 기울입니다. 목 왼쪽이 당기는 느낌이 들면 멈춥니다.",
      durationSec: 20,
      repetitions: null,
      restAfterSec: 5,
    },
    {
      title: "반대쪽 늘리기",
      instruction: "가운데로 돌아온 뒤 왼쪽으로 같은 동작을 한다.",
      voiceGuide: "머리를 천천히 가운데로 돌아오게 합니다. 이번에는 왼쪽 귀를 왼쪽 어깨 쪽으로 천천히 기울입니다. 아프면 바로 힘을 빼세요.",
      durationSec: 20,
      repetitions: null,
      restAfterSec: 5,
    },
    {
      title: "마무리",
      instruction: "머리를 가운데로 돌리고 어깨 힘을 뺀 채 심호흡한다.",
      voiceGuide: "머리를 가운데로 돌아오게 하고, 어깨에 힘을 뺍니다. 코로 크게 숨을 들이마시고 입으로 천천히 내쉽니다.",
      durationSec: 15,
      repetitions: null,
      restAfterSec: 0,
    },
  ],
  STRENGTH: [
    {
      title: "준비 자세",
      instruction: "의자 등받이 뒤에 서서 두 손으로 등받이를 잡는다.",
      voiceGuide: "의자 등받이 뒤에 섭니다. 두 손으로 등받이 윗부분을 잡고, 두 발을 어깨너비로 벌립니다.",
      durationSec: 15,
      repetitions: null,
      restAfterSec: 0,
    },
    {
      title: "무릎 굽히기",
      instruction: "엉덩이를 뒤로 빼며 무릎을 천천히 굽혔다 편다.",
      voiceGuide: "엉덩이를 뒤로 빼면서 무릎을 천천히 굽힙니다. 무릎이 발끝보다 앞으로 나가지 않게 합니다. 발바닥으로 바닥을 밀면서 다시 일어섭니다.",
      durationSec: 40,
      repetitions: 10,
      restAfterSec: 30,
    },
    {
      title: "마무리",
      instruction: "바르게 서서 다리를 가볍게 털어 준다.",
      voiceGuide: "바르게 섭니다. 한쪽 다리씩 가볍게 흔들어 힘을 풉니다.",
      durationSec: 20,
      repetitions: null,
      restAfterSec: 0,
    },
  ],
  CARDIO: [
    {
      title: "준비",
      instruction: "의자나 벽을 한 손으로 잡고 바르게 선다.",
      voiceGuide: "한 손으로 의자 등받이나 벽을 잡고 바르게 섭니다. 주변에 부딪힐 물건이 없는지 발로 천천히 확인합니다.",
      durationSec: 20,
      repetitions: null,
      restAfterSec: 0,
    },
    {
      title: "제자리 걷기",
      instruction: "무릎을 가볍게 들어 올리며 제자리에서 걷는다.",
      voiceGuide: "제자리에서 걷기 시작합니다. 왼발, 오른발, 무릎을 가볍게 들어 올립니다. 숨이 편하게 쉬어지는 빠르기를 유지합니다.",
      durationSec: 60,
      repetitions: null,
      restAfterSec: 20,
    },
    {
      title: "정리 걷기",
      instruction: "속도를 줄이며 천천히 걷다가 멈춘다.",
      voiceGuide: "걷는 속도를 천천히 줄입니다. 숨을 고르면서 멈춥니다.",
      durationSec: 30,
      repetitions: null,
      restAfterSec: 0,
    },
  ],
  BALANCE: [
    {
      title: "준비 자세",
      instruction: "의자 등받이를 두 손으로 잡고 선다.",
      voiceGuide: "의자 등받이를 두 손으로 잡고 바르게 섭니다. 두 발은 골반 너비로 벌립니다.",
      durationSec: 15,
      repetitions: null,
      restAfterSec: 0,
    },
    {
      title: "한 발 들기",
      instruction: "오른발을 바닥에서 살짝 들어 10초 버틴다.",
      voiceGuide: "왼발에 몸무게를 싣습니다. 오른발 뒤꿈치를 바닥에서 살짝 들어 10초 동안 버팁니다. 흔들리면 바로 발을 내려놓습니다.",
      durationSec: 10,
      repetitions: 3,
      restAfterSec: 10,
    },
    {
      title: "반대 발 들기",
      instruction: "왼발로 같은 동작을 한다.",
      voiceGuide: "이번에는 오른발에 몸무게를 싣고, 왼발 뒤꿈치를 살짝 들어 10초 동안 버팁니다.",
      durationSec: 10,
      repetitions: 3,
      restAfterSec: 10,
    },
  ],
  REHAB: [
    {
      title: "준비 자세",
      instruction: "의자에 앉아 한쪽 다리를 앞으로 편다.",
      voiceGuide: "의자에 깊숙이 앉습니다. 오른쪽 다리를 앞으로 쭉 펴서 뒤꿈치를 바닥에 댑니다.",
      durationSec: 15,
      repetitions: null,
      restAfterSec: 0,
    },
    {
      title: "발목 돌리기",
      instruction: "발목을 천천히 원을 그리며 돌린다.",
      voiceGuide: "오른쪽 발끝으로 큰 원을 그리듯 발목을 천천히 돌립니다. 바깥쪽으로 다섯 번, 안쪽으로 다섯 번 돌립니다.",
      durationSec: 30,
      repetitions: 10,
      restAfterSec: 10,
    },
    {
      title: "반대쪽 발목 돌리기",
      instruction: "왼쪽 다리로 같은 동작을 한다.",
      voiceGuide: "오른쪽 다리를 내리고 왼쪽 다리를 앞으로 폅니다. 왼쪽 발목도 바깥쪽으로 다섯 번, 안쪽으로 다섯 번 돌립니다.",
      durationSec: 30,
      repetitions: 10,
      restAfterSec: 0,
    },
  ],
};

export const DEFAULT_PRECAUTIONS = [
  "운동 중 통증, 어지럼, 숨이 심하게 차는 느낌이 있으면 즉시 멈추고 쉬세요.",
  "넘어지지 않도록 주변에 부딪힐 물건이 없는 곳에서 하세요.",
];

export function generateDraftFromJob(
  job: ContentJob,
  ids: { content: string; step: () => string },
  at: ISODateString,
): ExerciseContent {
  const steps: ExerciseStep[] = TEMPLATES[job.category].map((t, i) => ({
    ...t,
    id: ids.step(),
    order: i + 1,
    // content-worker가 단계별 음성까지 만든다 (설계 문서 7장)
    tts: { status: "READY", audioUrl: `mock://tts/${job.id}/${i + 1}`, generatedForText: t.voiceGuide, failureReason: null },
  }));
  const categoryLabel = EXERCISE_CATEGORY_LABELS[job.category];
  const difficultyLabel = DIFFICULTY_LABELS[job.difficulty];
  return {
    id: ids.content,
    title: job.title,
    summary: `${difficultyLabel} 단계의 ${categoryLabel} 운동입니다. 영상을 분석해 만든 AI 초안이므로 검수가 필요합니다.`,
    category: job.category,
    difficulty: job.difficulty,
    tags: [categoryLabel, difficultyLabel],
    precautions: [...DEFAULT_PRECAUTIONS],
    steps,
    sourceVideo: job.sourceVideo,
    status: "DRAFT",
    aiGenerated: true,
    internalNote: job.requestNote ? `제작 요청 사항: ${job.requestNote}` : "",
    reviewComment: null,
    createdBy: job.requestedBy,
    updatedBy: job.requestedBy,
    createdAt: at,
    updatedAt: at,
    publishedAt: null,
    version: 1,
  };
}
