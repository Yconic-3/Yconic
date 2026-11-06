import type { AdminUser, AuditLog, ContentJob, ExerciseContent, ExerciseSegment, TtsAsset, VideoAsset } from "@yconic/shared-types";
import { DEFAULT_PRECAUTIONS } from "./mock-analyzer";

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
  segmentId: string;
  text: string;
  requestedAtMs: number;
}

export interface MockState {
  schemaVersion: 4;
  videos: VideoAsset[];
  contents: ExerciseContent[];
  jobs: MockJob[];
  auditLogs: AuditLog[];
  ttsRequests: MockTtsRequest[];
}

function ready(text: string, key: string): TtsAsset {
  return { status: "READY", audioUrl: `mock://tts/${key}`, generatedForText: text, failureReason: null };
}
const NO_TTS: TtsAsset = { status: "NONE", audioUrl: null, generatedForText: null, failureReason: null };

type SegmentSeed = Omit<ExerciseSegment, "tts" | "order">;

function withTts(seeds: SegmentSeed[]): ExerciseSegment[] {
  return seeds.map((s, i) => ({ ...s, order: i + 1, tts: ready(s.voiceGuide, s.id) }));
}
function withoutTts(seeds: SegmentSeed[]): ExerciseSegment[] {
  return seeds.map((s, i) => ({ ...s, order: i + 1, tts: NO_TTS }));
}

export function createSeedState(nowMs: number): MockState {
  const ago = (min: number) => new Date(nowMs - min * 60_000).toISOString();

  // 예시 영상에는 실제 파일이 없다 (url: null). 새로 올린 영상은 브라우저 저장소에서 재생된다.
  const videos: VideoAsset[] = [
    { id: "v1", fileName: "neck-stretch.mp4", mimeType: "video/mp4", sizeBytes: 48_000_000, durationSec: 75, width: 1280, height: 720, url: null, uploadedBy: "u-editor", uploadedAt: ago(60 * 24 * 3) },
    { id: "v2", fileName: "chair-squat.mp4", mimeType: "video/mp4", sizeBytes: 72_000_000, durationSec: 110, width: 1920, height: 1080, url: null, uploadedBy: "u-editor", uploadedAt: ago(60 * 24) },
    { id: "v3", fileName: "wall-pushup.mp4", mimeType: "video/mp4", sizeBytes: 55_000_000, durationSec: 90, width: 1280, height: 720, url: null, uploadedBy: "u-editor", uploadedAt: ago(45) },
    { id: "v4", fileName: "march-in-place.mp4", mimeType: "video/mp4", sizeBytes: 60_000_000, durationSec: 120, width: 1280, height: 720, url: null, uploadedBy: "u-editor", uploadedAt: ago(60 * 30) },
    { id: "v5", fileName: "leg-raise-dark.mp4", mimeType: "video/mp4", sizeBytes: 31_000_000, durationSec: 80, width: 640, height: 360, url: null, uploadedBy: "u-editor", uploadedAt: ago(90) },
  ];
  const video = (id: string) => videos.find((v) => v.id === id)!;

  const neck = withTts([
    { id: "c1-s1", kind: "INTRO", startSec: 0, endSec: 10, title: "준비 자세", instruction: "의자에 허리를 펴고 앉는다.", voiceGuide: "의자에 허리를 펴고 앉습니다. 두 발바닥이 바닥에 닿게 하고 두 손은 허벅지 위에 둡니다.", repetitions: null },
    { id: "c1-s2", kind: "EXERCISE", startSec: 10, endSec: 40, title: "오른쪽으로 늘리기", instruction: "오른쪽으로 목을 기울인다.", voiceGuide: "숨을 내쉬면서 오른쪽 귀를 오른쪽 어깨 쪽으로 천천히 기울입니다. 목 왼쪽이 당기면 멈추고 그대로 유지합니다.", repetitions: null },
    { id: "c1-s3", kind: "EXERCISE", startSec: 40, endSec: 68, title: "왼쪽으로 늘리기", instruction: "왼쪽으로 목을 기울인다.", voiceGuide: "머리를 가운데로 돌아오게 합니다. 이번에는 왼쪽 귀를 왼쪽 어깨 쪽으로 천천히 기울입니다.", repetitions: null },
    { id: "c1-s4", kind: "OUTRO", startSec: 68, endSec: 75, title: "마무리", instruction: "가운데로 돌아와 심호흡한다.", voiceGuide: "머리를 가운데로 돌아오게 하고 어깨에 힘을 뺍니다. 크게 숨을 들이마시고 천천히 내쉽니다.", repetitions: null },
  ]);

  const squat = withTts([
    { id: "c2-s1", kind: "INTRO", startSec: 0, endSec: 12, title: "의자 잡고 서기", instruction: "의자 등받이를 잡고 선다.", voiceGuide: "의자 등받이 뒤에 서서 두 손으로 등받이를 잡습니다. 두 발은 어깨너비로 벌립니다.", repetitions: null },
    { id: "c2-s2", kind: "EXERCISE", startSec: 12, endSec: 55, title: "앉았다 일어서기", instruction: "무릎을 굽혔다 편다.", voiceGuide: "엉덩이를 뒤로 빼며 무릎을 천천히 굽힙니다. 발바닥으로 바닥을 밀면서 다시 일어섭니다. 열 번 반복합니다.", repetitions: 10 },
    { id: "c2-s3", kind: "REST", startSec: 55, endSec: 70, title: "휴식", instruction: "잠시 쉰다.", voiceGuide: "잠시 쉬어 갑니다. 숨을 고르고 무릎에 불편한 느낌이 없는지 확인합니다.", repetitions: null },
    { id: "c2-s4", kind: "EXERCISE", startSec: 70, endSec: 100, title: "뒤꿈치 들기", instruction: "발뒤꿈치를 들었다 내린다.", voiceGuide: "두 발뒤꿈치를 천천히 들어 발끝으로 섭니다. 잠시 멈췄다가 천천히 내립니다. 열 번 반복합니다.", repetitions: 10 },
    { id: "c2-s5", kind: "OUTRO", startSec: 100, endSec: 110, title: "마무리", instruction: "다리를 털어 준다.", voiceGuide: "바르게 서서 한쪽 다리씩 가볍게 흔들어 힘을 풉니다.", repetitions: null },
  ]);

  // 음성 미생성 + 시각 의존 표현("이렇게") 검사 시연용
  const wall = withoutTts([
    { id: "c3-s1", kind: "INTRO", startSec: 0, endSec: 11, title: "벽 앞에 서기", instruction: "벽에서 팔 길이만큼 떨어져 선다.", voiceGuide: "벽을 마주 보고 섭니다. 두 팔을 앞으로 뻗었을 때 손바닥이 벽에 닿는 거리에 섭니다.", repetitions: null },
    { id: "c3-s2", kind: "EXERCISE", startSec: 11, endSec: 46, title: "벽 밀기", instruction: "팔꿈치를 굽혀 몸을 벽에 가까이 했다가 민다.", voiceGuide: "팔꿈치를 이렇게 굽혀서 가슴을 벽 쪽으로 가져갑니다. 손바닥으로 벽을 밀면서 처음 자세로 돌아옵니다.", repetitions: 10 },
    { id: "c3-s3", kind: "REST", startSec: 46, endSec: 53, title: "휴식", instruction: "잠시 쉰다.", voiceGuide: "잠시 쉬어 갑니다. 숨을 고르고, 아프거나 어지러운 곳이 없는지 느껴 봅니다.", repetitions: null },
    { id: "c3-s4", kind: "EXERCISE", startSec: 53, endSec: 81, title: "뒤꿈치 들기", instruction: "발뒤꿈치를 들었다 내린다.", voiceGuide: "두 발뒤꿈치를 천천히 들어 발끝으로 섭니다. 잠시 멈췄다가 천천히 내립니다.", repetitions: 10 },
    { id: "c3-s5", kind: "OUTRO", startSec: 81, endSec: 90, title: "마무리", instruction: "심호흡하며 마무리한다.", voiceGuide: "운동이 끝났습니다. 어깨에 힘을 빼고 코로 크게 숨을 들이마신 뒤 입으로 천천히 내쉽니다.", repetitions: null },
  ]);

  // 준비 구간 없이 시작 → 수정 요청 시연용
  const march = withTts([
    { id: "c4-s1", kind: "EXERCISE", startSec: 0, endSec: 60, title: "제자리 걷기", instruction: "제자리에서 걷는다.", voiceGuide: "제자리에서 걷습니다. 무릎을 가볍게 들어 올립니다.", repetitions: null },
    { id: "c4-s2", kind: "EXERCISE", startSec: 60, endSec: 110, title: "팔 흔들며 걷기", instruction: "팔을 크게 흔들며 걷는다.", voiceGuide: "걸으면서 두 팔을 앞뒤로 크게 흔듭니다.", repetitions: null },
    { id: "c4-s3", kind: "OUTRO", startSec: 110, endSec: 120, title: "정리", instruction: "속도를 줄이며 멈춘다.", voiceGuide: "걷는 속도를 천천히 줄입니다. 숨을 고르면서 멈춥니다.", repetitions: null },
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
      video: video("v1"),
      segments: neck,
      analysis: { provider: "mock", model: null, analyzedAt: ago(60 * 24 * 3), summary: "모의 분석 결과를 관리자가 수정했습니다." },
      status: "PUBLISHED",
      aiGenerated: true,
      internalNote: "",
      reviewComment: null,
      createdBy: "u-editor",
      submittedBy: "u-editor",
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
      video: video("v2"),
      segments: squat,
      analysis: { provider: "mock", model: null, analyzedAt: ago(60 * 24), summary: "모의 분석: 110초 영상을 운동 2개 구간으로 나눴습니다." },
      status: "IN_REVIEW",
      aiGenerated: true,
      internalNote: "무릎 각도 설명 확인 필요",
      reviewComment: null,
      createdBy: "u-editor",
      submittedBy: "u-editor",
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
      video: video("v3"),
      segments: wall,
      analysis: { provider: "mock", model: null, analyzedAt: ago(40), summary: "모의 분석: 90초 영상을 운동 2개 구간으로 나눴습니다." },
      status: "DRAFT",
      aiGenerated: true,
      internalNote: "제작 요청 사항: 손목이 약한 분도 할 수 있게 설명",
      reviewComment: null,
      createdBy: "u-editor",
      submittedBy: null,
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
      video: video("v4"),
      segments: march,
      analysis: null,
      status: "CHANGES_REQUESTED",
      aiGenerated: false,
      internalNote: "",
      reviewComment: "영상 시작 부분에 주변 장애물을 확인하는 준비 구간과 주의사항을 추가해 주세요.",
      createdBy: "u-editor",
      submittedBy: "u-editor",
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
      kind: "CREATE",
      title: "벽 밀기 상체 운동",
      category: "STRENGTH",
      difficulty: "BEGINNER",
      requestNote: "손목이 약한 분도 할 수 있게 설명",
      video: video("v3"),
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
      kind: "CREATE",
      title: "누워서 다리 들기",
      category: "REHAB",
      difficulty: "BEGINNER",
      requestNote: "",
      video: video("v5"),
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
    { id: "a1", action: "CONTENT_STATUS_CHANGED", actorId: "u-approver", actorName: "이승인", actorRole: "APPROVER", targetType: "CONTENT", targetId: "c1", summary: "승인됨 → 공개 중", createdAt: ago(60 * 24 * 2) },
    { id: "a2", action: "CONTENT_STATUS_CHANGED", actorId: "u-approver", actorName: "이승인", actorRole: "APPROVER", targetType: "CONTENT", targetId: "c4", summary: "검수 중 → 수정 요청 (의견: 영상 시작 부분에 주변 장애물을 확인하는 준비 구간과 주의사항을 추가해 주세요.)", createdAt: ago(60 * 5) },
    { id: "a3", action: "CONTENT_STATUS_CHANGED", actorId: "u-editor", actorName: "김편집", actorRole: "EDITOR", targetType: "CONTENT", targetId: "c2", summary: "초안 → 검수 중", createdAt: ago(120) },
    { id: "a4", action: "CONTENT_JOB_CREATED", actorId: "u-editor", actorName: "김편집", actorRole: "EDITOR", targetType: "CONTENT_JOB", targetId: "j1", summary: "제작 작업 생성: 벽 밀기 상체 운동 (wall-pushup.mp4)", createdAt: ago(45) },
    { id: "a5", action: "CONTENT_CREATED", actorId: "u-editor", actorName: "김편집", actorRole: "EDITOR", targetType: "CONTENT", targetId: "c3", summary: "AI 초안 생성 완료: 벽 밀기 상체 운동", createdAt: ago(40) },
  ];

  return { schemaVersion: 4, videos, contents, jobs, auditLogs, ttsRequests: [] };
}
