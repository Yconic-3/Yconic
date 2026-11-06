import type { AdminUser, AuditLog, ContentJob, ExerciseContent, ExerciseStep, TtsAsset } from "@yconic/shared-types";
import { DEFAULT_PRECAUTIONS } from "./draft-generator";

/** 모의 로그인용 관리자 계정. 실제 인증이 붙으면 사용하지 않는다. */
export const MOCK_USERS: AdminUser[] = [
  { id: "u-editor", name: "김편집", email: "editor@example.com", role: "EDITOR" },
  { id: "u-approver", name: "이승인", email: "approver@example.com", role: "APPROVER" },
  { id: "u-super", name: "박관리", email: "super@example.com", role: "SUPER_ADMIN" },
  { id: "u-viewer", name: "최조회", email: "viewer@example.com", role: "VIEWER" },
];

export interface MockJob extends ContentJob {
  /** 모의 진행 시작 시각 (ms) */
  startedAtMs: number;
  /** 실패를 시연할 작업인지 */
  simulateFailure: boolean;
}

export interface MockTtsRequest {
  contentId: string;
  stepId: string;
  text: string;
  requestedAtMs: number;
}

export interface MockState {
  schemaVersion: 1;
  contents: ExerciseContent[];
  jobs: MockJob[];
  auditLogs: AuditLog[];
  ttsRequests: MockTtsRequest[];
}

function ready(text: string, key: string): TtsAsset {
  return { status: "READY", audioUrl: `mock://tts/${key}`, generatedForText: text, failureReason: null };
}
const NO_TTS: TtsAsset = { status: "NONE", audioUrl: null, generatedForText: null, failureReason: null };

type StepSeed = Omit<ExerciseStep, "tts" | "order">;

function withTts(seeds: StepSeed[]): ExerciseStep[] {
  return seeds.map((s, i) => ({ ...s, order: i + 1, tts: ready(s.voiceGuide, s.id) }));
}
function withoutTts(seeds: StepSeed[]): ExerciseStep[] {
  return seeds.map((s, i) => ({ ...s, order: i + 1, tts: NO_TTS }));
}

export function createSeedState(nowMs: number): MockState {
  const ago = (min: number) => new Date(nowMs - min * 60_000).toISOString();

  const neckSteps = withTts([
    {
      id: "c1-s1",
      title: "준비 자세",
      instruction: "의자에 허리를 펴고 앉는다.",
      voiceGuide: "의자에 허리를 펴고 앉습니다. 두 발바닥이 바닥에 닿게 합니다.",
      durationSec: 15,
      repetitions: null,
      restAfterSec: 0,
    },
    {
      id: "c1-s2",
      title: "목 옆으로 늘리기",
      instruction: "오른쪽, 왼쪽으로 목을 기울인다.",
      voiceGuide:
        "숨을 내쉬면서 오른쪽 귀를 오른쪽 어깨 쪽으로 천천히 기울입니다. 목 왼쪽이 당기면 멈추고 15초 동안 유지합니다.",
      durationSec: 30,
      repetitions: null,
      restAfterSec: 10,
    },
  ]);

  const squatSteps = withTts([
    {
      id: "c2-s1",
      title: "의자 잡고 서기",
      instruction: "의자 등받이를 잡고 선다.",
      voiceGuide: "의자 등받이 뒤에 서서 두 손으로 등받이를 잡습니다. 두 발은 어깨너비로 벌립니다.",
      durationSec: 15,
      repetitions: null,
      restAfterSec: 0,
    },
    {
      id: "c2-s2",
      title: "앉았다 일어서기",
      instruction: "무릎을 굽혔다 편다.",
      voiceGuide: "엉덩이를 뒤로 빼며 무릎을 천천히 굽힙니다. 발바닥으로 바닥을 밀면서 다시 일어섭니다.",
      durationSec: 40,
      repetitions: 10,
      restAfterSec: 30,
    },
  ]);

  // 음성 미생성 + 시각 의존 표현("이렇게") 검사 시연용
  const wallSteps = withoutTts([
    {
      id: "c3-s1",
      title: "벽 앞에 서기",
      instruction: "벽에서 팔 길이만큼 떨어져 선다.",
      voiceGuide: "벽을 마주 보고 섭니다. 두 팔을 앞으로 뻗었을 때 손바닥이 벽에 닿는 거리에 섭니다.",
      durationSec: 15,
      repetitions: null,
      restAfterSec: 0,
    },
    {
      id: "c3-s2",
      title: "벽 밀기",
      instruction: "팔꿈치를 굽혀 몸을 벽에 가까이 했다가 민다.",
      voiceGuide: "팔꿈치를 이렇게 굽혀서 가슴을 벽 쪽으로 가져갑니다. 손바닥으로 벽을 밀면서 처음 자세로 돌아옵니다.",
      durationSec: 40,
      repetitions: 10,
      restAfterSec: 20,
    },
  ]);

  const walkSteps = withTts([
    {
      id: "c4-s1",
      title: "제자리 걷기",
      instruction: "제자리에서 걷는다.",
      voiceGuide: "제자리에서 걷습니다. 무릎을 가볍게 들어 올립니다.",
      durationSec: 60,
      repetitions: null,
      restAfterSec: 0,
    },
  ]);

  const contents: ExerciseContent[] = [
    {
      id: "c1",
      title: "앉아서 하는 목 스트레칭",
      summary: "의자에 앉아 목 옆 근육을 천천히 늘려 주는 초급 스트레칭입니다.",
      category: "STRETCHING",
      difficulty: "BEGINNER",
      tags: ["목", "앉아서", "사무실"],
      precautions: [...DEFAULT_PRECAUTIONS],
      steps: neckSteps,
      sourceVideo: { fileName: "neck-stretch.mp4", sizeBytes: 48_000_000, url: null },
      status: "PUBLISHED",
      aiGenerated: true,
      internalNote: "",
      reviewComment: null,
      createdBy: "u-editor",
      updatedBy: "u-approver",
      createdAt: ago(60 * 24 * 3),
      updatedAt: ago(60 * 24 * 2),
      publishedAt: ago(60 * 24 * 2),
      version: 4,
    },
    {
      id: "c2",
      title: "의자 잡고 스쿼트",
      summary: "의자 등받이를 잡고 안전하게 하는 하체 근력 운동입니다.",
      category: "STRENGTH",
      difficulty: "BEGINNER",
      tags: ["하체", "의자"],
      precautions: [...DEFAULT_PRECAUTIONS, "무릎에 통증이 있으면 굽히는 깊이를 줄이세요."],
      steps: squatSteps,
      sourceVideo: { fileName: "chair-squat.mp4", sizeBytes: 72_000_000, url: null },
      status: "IN_REVIEW",
      aiGenerated: true,
      internalNote: "무릎 각도 설명 확인 필요",
      reviewComment: null,
      createdBy: "u-editor",
      updatedBy: "u-editor",
      createdAt: ago(60 * 24),
      updatedAt: ago(120),
      publishedAt: null,
      version: 3,
    },
    {
      id: "c3",
      title: "벽 밀기 상체 운동",
      summary: "벽을 이용해 가슴과 팔 근육을 쓰는 운동입니다.",
      category: "STRENGTH",
      difficulty: "BEGINNER",
      tags: ["상체", "벽"],
      precautions: [...DEFAULT_PRECAUTIONS],
      steps: wallSteps,
      sourceVideo: { fileName: "wall-pushup.mp4", sizeBytes: 55_000_000, url: null },
      status: "DRAFT",
      aiGenerated: true,
      internalNote: "제작 요청 사항: 손목이 약한 분도 할 수 있게 설명",
      reviewComment: null,
      createdBy: "u-editor",
      updatedBy: "u-editor",
      createdAt: ago(40),
      updatedAt: ago(40),
      publishedAt: null,
      version: 1,
    },
    {
      id: "c4",
      title: "제자리 걷기",
      summary: "실내에서 할 수 있는 가벼운 유산소 운동입니다.",
      category: "CARDIO",
      difficulty: "BEGINNER",
      tags: ["유산소", "실내"],
      precautions: [],
      steps: walkSteps,
      sourceVideo: null,
      status: "CHANGES_REQUESTED",
      aiGenerated: false,
      internalNote: "",
      reviewComment: "주변 장애물을 확인하는 준비 단계와 주의사항을 추가해 주세요.",
      createdBy: "u-editor",
      updatedBy: "u-approver",
      createdAt: ago(60 * 30),
      updatedAt: ago(60 * 5),
      publishedAt: null,
      version: 2,
    },
  ];

  const jobs: MockJob[] = [
    {
      id: "j1",
      title: "벽 밀기 상체 운동",
      category: "STRENGTH",
      difficulty: "BEGINNER",
      requestNote: "손목이 약한 분도 할 수 있게 설명",
      sourceVideo: { fileName: "wall-pushup.mp4", sizeBytes: 55_000_000, url: null },
      status: "COMPLETED",
      progress: 100,
      failureReason: null,
      contentId: "c3",
      requestedBy: "u-editor",
      createdAt: ago(45),
      updatedAt: ago(40),
      completedAt: ago(40),
      startedAtMs: nowMs - 45 * 60_000,
      simulateFailure: false,
    },
    {
      id: "j2",
      title: "누워서 다리 들기",
      category: "REHAB",
      difficulty: "BEGINNER",
      requestNote: "",
      sourceVideo: { fileName: "leg-raise-dark.mp4", sizeBytes: 31_000_000, url: null },
      status: "FAILED",
      progress: 20,
      failureReason: "영상에서 사람의 동작을 인식하지 못했습니다. 전신이 밝게 나오는 영상인지 확인해 주세요.",
      contentId: null,
      requestedBy: "u-editor",
      createdAt: ago(90),
      updatedAt: ago(88),
      completedAt: null,
      startedAtMs: nowMs - 90 * 60_000,
      simulateFailure: true,
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: "a1",
      action: "CONTENT_STATUS_CHANGED",
      actorId: "u-approver",
      actorName: "이승인",
      actorRole: "APPROVER",
      targetType: "CONTENT",
      targetId: "c1",
      summary: "승인됨 → 공개 중",
      createdAt: ago(60 * 24 * 2),
    },
    {
      id: "a2",
      action: "CONTENT_STATUS_CHANGED",
      actorId: "u-approver",
      actorName: "이승인",
      actorRole: "APPROVER",
      targetType: "CONTENT",
      targetId: "c4",
      summary: "검수 중 → 수정 요청 (의견: 주변 장애물을 확인하는 준비 단계와 주의사항을 추가해 주세요.)",
      createdAt: ago(60 * 5),
    },
    {
      id: "a3",
      action: "CONTENT_STATUS_CHANGED",
      actorId: "u-editor",
      actorName: "김편집",
      actorRole: "EDITOR",
      targetType: "CONTENT",
      targetId: "c2",
      summary: "초안 → 검수 중",
      createdAt: ago(120),
    },
    {
      id: "a4",
      action: "CONTENT_JOB_CREATED",
      actorId: "u-editor",
      actorName: "김편집",
      actorRole: "EDITOR",
      targetType: "CONTENT_JOB",
      targetId: "j1",
      summary: "제작 작업 생성: 벽 밀기 상체 운동 (wall-pushup.mp4)",
      createdAt: ago(45),
    },
    {
      id: "a5",
      action: "CONTENT_CREATED",
      actorId: "u-editor",
      actorName: "김편집",
      actorRole: "EDITOR",
      targetType: "CONTENT",
      targetId: "c3",
      summary: "AI 초안 생성 완료: 벽 밀기 상체 운동",
      createdAt: ago(40),
    },
  ];

  return { schemaVersion: 1, contents, jobs, auditLogs, ttsRequests: [] };
}
