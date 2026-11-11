import type { ExerciseContent, ExerciseSegment, VideoAsset } from "@yconic/shared-types";

/**
 * 공개 중인 예시 운동 목록 (원래 사용자 앱 예시 데이터).
 * 사용자 화면과 관리자 화면이 같은 모의 저장소를 쓰므로, 이 목록이 사용자 화면의 처음 운동 목록이 된다.
 * 영상 파일은 없다 (url: null). 이때 화면은 영상 없이 시간만 흘려 구간 안내를 들려준다.
 */

const SEEDED_AT = "2026-11-10T00:00:00.000Z";

export const CATALOG_PRECAUTIONS = [
  "아프거나 어지러우면 바로 멈추고 쉬세요.",
  "주변에 부딪힐 물건이 없는지 손으로 확인하고 시작하세요.",
];

type SegmentSeed = Omit<ExerciseSegment, "tts" | "order">;

function segments(seeds: SegmentSeed[]): ExerciseSegment[] {
  return seeds.map((s, i) => ({
    ...s,
    order: i + 1,
    // 실제 음성 파일은 content-worker가 만든다. 모의 데이터에는 파일이 없어 사용자 화면이 브라우저 음성으로 읽는다.
    tts: { status: "NONE", audioUrl: null, generatedForText: null, failureReason: null },
  }));
}

function video(id: string, fileName: string, durationSec: number): VideoAsset {
  return {
    id,
    fileName,
    mimeType: "video/mp4",
    sizeBytes: 0,
    durationSec,
    width: 1280,
    height: 720,
    url: null,
    uploadedBy: "u-editor",
    uploadedAt: SEEDED_AT,
  };
}

function published(
  base: Pick<ExerciseContent, "id" | "title" | "summary" | "category" | "difficulty" | "tags" | "video" | "segments"> & {
    precautions?: string[];
  },
): ExerciseContent {
  return {
    ...base,
    precautions: base.precautions ?? [...CATALOG_PRECAUTIONS],
    analysis: null,
    status: "PUBLISHED",
    aiGenerated: true,
    internalNote: "",
    reviewComment: null,
    createdBy: "u-editor",
    submittedBy: "u-editor",
    updatedBy: "u-approver",
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    publishedAt: SEEDED_AT,
    version: 1,
  };
}

export function createCatalogContents(): ExerciseContent[] {
  return [
    published({
      id: "c-neck",
      title: "앉아서 하는 목 스트레칭",
      summary: "의자에 앉아 목 옆 근육을 천천히 늘려 주는 초급 스트레칭입니다.",
      category: "STRETCHING",
      difficulty: "BEGINNER",
      tags: ["목", "앉아서"],
      video: video("v-neck", "neck-stretch.mp4", 75),
      segments: segments([
        { id: "c-neck-s1", kind: "INTRO", startSec: 0, endSec: 12, title: "준비 자세", instruction: "의자에 허리를 펴고 앉는다.", voiceGuide: "의자에 허리를 펴고 앉습니다. 두 발바닥이 바닥에 닿게 하고 두 손은 허벅지 위에 둡니다.", repetitions: null },
        { id: "c-neck-s2", kind: "EXERCISE", startSec: 12, endSec: 40, title: "오른쪽으로 늘리기", instruction: "오른쪽으로 목을 기울인다.", voiceGuide: "숨을 내쉬면서 오른쪽 귀를 오른쪽 어깨 쪽으로 천천히 기울입니다. 목 왼쪽이 당기면 멈추고 그대로 유지합니다.", repetitions: null },
        { id: "c-neck-s3", kind: "EXERCISE", startSec: 40, endSec: 66, title: "왼쪽으로 늘리기", instruction: "왼쪽으로 목을 기울인다.", voiceGuide: "머리를 가운데로 돌아오게 합니다. 이번에는 왼쪽 귀를 왼쪽 어깨 쪽으로 천천히 기울이고 그대로 유지합니다.", repetitions: null },
        { id: "c-neck-s4", kind: "OUTRO", startSec: 66, endSec: 75, title: "마무리", instruction: "가운데로 돌아와 심호흡한다.", voiceGuide: "머리를 가운데로 돌아오게 하고 어깨에 힘을 뺍니다. 크게 숨을 들이마시고 천천히 내쉽니다.", repetitions: null },
      ]),
    }),
    published({
      id: "c-squat",
      title: "의자 잡고 스쿼트",
      summary: "의자 등받이를 잡고 안전하게 하는 하체 근력 운동입니다.",
      category: "STRENGTH",
      difficulty: "BEGINNER",
      tags: ["하체", "의자"],
      precautions: [...CATALOG_PRECAUTIONS, "무릎에 통증이 있으면 굽히는 깊이를 줄이세요."],
      video: video("v-squat", "chair-squat.mp4", 110),
      segments: segments([
        { id: "c-squat-s1", kind: "INTRO", startSec: 0, endSec: 14, title: "의자 잡고 서기", instruction: "의자 등받이를 잡고 선다.", voiceGuide: "의자 등받이 뒤에 서서 두 손으로 등받이를 잡습니다. 두 발은 어깨너비로 벌리고 발끝은 정면을 향합니다.", repetitions: null },
        { id: "c-squat-s2", kind: "EXERCISE", startSec: 14, endSec: 56, title: "앉았다 일어서기", instruction: "무릎을 굽혔다 편다.", voiceGuide: "엉덩이를 뒤로 빼며 셋을 세는 동안 무릎을 천천히 굽힙니다. 발바닥으로 바닥을 밀면서 둘을 세는 동안 다시 일어섭니다. 열 번 반복합니다.", repetitions: 10 },
        { id: "c-squat-s3", kind: "REST", startSec: 56, endSec: 70, title: "휴식", instruction: "잠시 쉰다.", voiceGuide: "잠시 쉬어 갑니다. 숨을 고르고 무릎에 불편한 느낌이 없는지 확인합니다.", repetitions: null },
        { id: "c-squat-s4", kind: "EXERCISE", startSec: 70, endSec: 100, title: "뒤꿈치 들기", instruction: "발뒤꿈치를 들었다 내린다.", voiceGuide: "등받이를 잡은 채로 두 발뒤꿈치를 천천히 들어 발끝으로 섭니다. 잠시 멈췄다가 천천히 내립니다. 열 번 반복합니다.", repetitions: 10 },
        { id: "c-squat-s5", kind: "OUTRO", startSec: 100, endSec: 110, title: "마무리", instruction: "다리를 털어 준다.", voiceGuide: "바르게 서서 한쪽 다리씩 가볍게 흔들어 힘을 풉니다.", repetitions: null },
      ]),
    }),
    published({
      id: "c-wall",
      title: "벽 밀기 상체 운동",
      summary: "벽을 이용해 가슴과 팔 근육을 쓰는 상체 근력 운동입니다.",
      category: "STRENGTH",
      difficulty: "BEGINNER",
      tags: ["상체", "벽"],
      video: video("v-wall", "wall-pushup.mp4", 90),
      segments: segments([
        { id: "c-wall-s1", kind: "INTRO", startSec: 0, endSec: 14, title: "벽 앞에 서기", instruction: "벽에서 팔 길이만큼 떨어져 선다.", voiceGuide: "벽을 마주 보고 섭니다. 두 팔을 앞으로 뻗었을 때 손바닥이 벽에 닿는 거리에 서고, 손은 어깨 높이에 어깨너비보다 조금 넓게 둡니다.", repetitions: null },
        { id: "c-wall-s2", kind: "EXERCISE", startSec: 14, endSec: 50, title: "벽 밀기", instruction: "팔꿈치를 굽혀 몸을 벽에 가까이 했다가 민다.", voiceGuide: "팔꿈치를 옆구리 쪽으로 굽히면서 둘을 세는 동안 가슴을 벽 쪽으로 가져갑니다. 손바닥으로 벽을 밀면서 처음 자세로 돌아옵니다. 열 번 반복합니다.", repetitions: 10 },
        { id: "c-wall-s3", kind: "REST", startSec: 50, endSec: 60, title: "휴식", instruction: "잠시 쉰다.", voiceGuide: "잠시 쉬어 갑니다. 팔을 내리고 숨을 고릅니다.", repetitions: null },
        { id: "c-wall-s4", kind: "OUTRO", startSec: 60, endSec: 90, title: "마무리", instruction: "어깨를 돌리며 마무리한다.", voiceGuide: "두 어깨를 귀 쪽으로 올렸다가 뒤로 크게 돌려 내립니다. 다섯 번 반복하고 숨을 천천히 내쉽니다.", repetitions: 5 },
      ]),
    }),
    published({
      id: "c-march",
      title: "제자리 걷기",
      summary: "벽이나 의자를 짚고 제자리에서 걷는 가벼운 유산소 운동입니다.",
      category: "CARDIO",
      difficulty: "BEGINNER",
      tags: ["걷기", "전신"],
      video: video("v-march", "march-in-place.mp4", 120),
      segments: segments([
        { id: "c-march-s1", kind: "INTRO", startSec: 0, endSec: 12, title: "준비", instruction: "벽이나 의자를 짚고 선다.", voiceGuide: "한 손으로 벽이나 의자 등받이를 짚고 바르게 섭니다. 두 발은 골반너비로 벌립니다.", repetitions: null },
        { id: "c-march-s2", kind: "EXERCISE", startSec: 12, endSec: 60, title: "제자리 걷기", instruction: "제자리에서 걷는다.", voiceGuide: "제자리에서 걷습니다. 무릎을 골반 높이의 절반쯤까지 가볍게 들어 올리고, 발바닥 전체로 조용히 내려놓습니다.", repetitions: null },
        { id: "c-march-s3", kind: "EXERCISE", startSec: 60, endSec: 108, title: "팔 흔들며 걷기", instruction: "팔을 흔들며 걷는다.", voiceGuide: "계속 걸으면서, 짚지 않은 쪽 팔을 앞뒤로 흔듭니다. 숨이 차면 걷는 속도를 줄입니다.", repetitions: null },
        { id: "c-march-s4", kind: "OUTRO", startSec: 108, endSec: 120, title: "정리", instruction: "속도를 줄이며 멈춘다.", voiceGuide: "걷는 속도를 천천히 줄입니다. 숨을 고르면서 멈춥니다.", repetitions: null },
      ]),
    }),
  ];
}
