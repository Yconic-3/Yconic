import type { AdminRole, AdminUser, AuditLog, ContentJob, ExerciseContent, ExerciseSegment, TtsAsset, VideoAsset } from "@yconic/shared-types";
import { DEFAULT_PRECAUTIONS } from "@yconic/content-analysis";
import { createCatalogContents } from "./catalog";

/**
 * 예시 데이터. 두 곳에서 같은 데이터를 쓴다.
 * - 웹앱의 모의 모드 (apps/web/src/mock)
 * - 데이터베이스 처음 데이터 (pnpm db:seed)
 */

export interface FixtureAccount {
  id: string;
  name: string;
  email: string;
  /** 개발·시연용 비밀번호. 실제 서비스 비밀번호가 아니다. DB에는 해시로만 넣는다. */
  password: string;
  /** 관리자 역할. 일반 회원이면 null */
  adminRole: AdminRole | null;
}

export const FIXTURE_ACCOUNTS: FixtureAccount[] = [
  { id: "u-member", name: "체험 회원", email: "member@example.com", password: "member1234", adminRole: null },
  { id: "u-editor", name: "김편집", email: "editor@example.com", password: "editor1234", adminRole: "EDITOR" },
  { id: "u-approver", name: "이승인", email: "approver@example.com", password: "approver1234", adminRole: "APPROVER" },
  { id: "u-super", name: "박관리", email: "super@example.com", password: "super1234", adminRole: "SUPER_ADMIN" },
  { id: "u-viewer", name: "최조회", email: "viewer@example.com", password: "viewer1234", adminRole: "VIEWER" },
];

/** 관리자 계정만 관리자 사용자 모양으로 */
export const FIXTURE_ADMIN_USERS: AdminUser[] = FIXTURE_ACCOUNTS.filter((a) => a.adminRole).map((a) => ({
  id: a.id,
  name: a.name,
  email: a.email,
  role: a.adminRole!,
}));

export interface FixtureJob extends ContentJob {
  /** 작업이 단계를 시작한 시각 (ms) */
  startedAtMs: number;
  /** 개발용: 실패 상황 시연 */
  simulateFailure: boolean;
}

export interface Fixtures {
  videos: VideoAsset[];
  contents: ExerciseContent[];
  jobs: FixtureJob[];
  auditLogs: AuditLog[];
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

/**
 * 처음 상태.
 * - 공개 중인 운동 4개 (catalog.ts): 사용자 화면의 처음 운동 목록
 * - 관리자 흐름 시연용 3개: 검수 중(c2), 초안(c3), 수정 요청(c4). 사용자 화면에는 나오지 않는다.
 */
export function createFixtures(nowMs: number): Fixtures {
  const ago = (min: number) => new Date(nowMs - min * 60_000).toISOString();

  const catalog = createCatalogContents();

  // 예시 영상에는 실제 파일이 없다 (url: null). 새로 올린 영상은 브라우저 저장소에서 재생된다.
  const demoVideos: VideoAsset[] = [
    { id: "v2", fileName: "seated-leg-extension.mp4", mimeType: "video/mp4", sizeBytes: 72_000_000, durationSec: 100, width: 1920, height: 1080, url: null, uploadedBy: "u-editor", uploadedAt: ago(60 * 24) },
    { id: "v3", fileName: "wall-calf-stretch.mp4", mimeType: "video/mp4", sizeBytes: 55_000_000, durationSec: 90, width: 1280, height: 720, url: null, uploadedBy: "u-editor", uploadedAt: ago(45) },
    { id: "v4", fileName: "seated-arm-swing.mp4", mimeType: "video/mp4", sizeBytes: 60_000_000, durationSec: 120, width: 1280, height: 720, url: null, uploadedBy: "u-editor", uploadedAt: ago(60 * 30) },
    { id: "v5", fileName: "leg-raise-dark.mp4", mimeType: "video/mp4", sizeBytes: 31_000_000, durationSec: 80, width: 640, height: 360, url: null, uploadedBy: "u-editor", uploadedAt: ago(90) },
  ];
  const videos = [...catalog.map((c) => c.video), ...demoVideos];
  const video = (id: string) => videos.find((v) => v.id === id)!;

  // 검수 중 시연용
  const legExtension = withTts([
    { id: "c2-s1", kind: "INTRO", startSec: 0, endSec: 12, title: "의자에 앉기", instruction: "의자 앞쪽에 허리를 펴고 앉는다.", voiceGuide: "의자 앞쪽에 허리를 펴고 앉습니다. 두 손으로 의자 옆을 가볍게 잡습니다.", repetitions: null },
    { id: "c2-s2", kind: "EXERCISE", startSec: 12, endSec: 50, title: "오른쪽 다리 펴기", instruction: "오른쪽 무릎을 펴서 다리를 앞으로 든다.", voiceGuide: "오른쪽 무릎을 천천히 펴서 다리를 앞으로 듭니다. 허벅지 앞쪽에 힘이 들어가면 셋을 세고 내립니다. 열 번 반복합니다.", repetitions: 10 },
    { id: "c2-s3", kind: "REST", startSec: 50, endSec: 62, title: "휴식", instruction: "잠시 쉰다.", voiceGuide: "잠시 쉬어 갑니다. 숨을 고르고 무릎에 불편한 느낌이 없는지 확인합니다.", repetitions: null },
    { id: "c2-s4", kind: "EXERCISE", startSec: 62, endSec: 92, title: "왼쪽 다리 펴기", instruction: "왼쪽 다리로 같은 동작을 한다.", voiceGuide: "이번에는 왼쪽 무릎을 천천히 펴서 다리를 앞으로 듭니다. 셋을 세고 내립니다. 열 번 반복합니다.", repetitions: 10 },
    { id: "c2-s5", kind: "OUTRO", startSec: 92, endSec: 100, title: "마무리", instruction: "다리를 털어 준다.", voiceGuide: "두 발을 바닥에 내려놓고 다리를 가볍게 흔들어 힘을 풉니다.", repetitions: null },
  ]);

  // 초안 시연용: 음성 미생성 + 시각 의존 표현("이렇게") 경고
  const calfStretch = withoutTts([
    { id: "c3-s1", kind: "INTRO", startSec: 0, endSec: 11, title: "벽 앞에 서기", instruction: "벽을 마주 보고 두 손을 벽에 댄다.", voiceGuide: "벽을 마주 보고 섭니다. 두 손바닥을 어깨 높이에서 벽에 댑니다.", repetitions: null },
    { id: "c3-s2", kind: "EXERCISE", startSec: 11, endSec: 46, title: "오른쪽 종아리 늘리기", instruction: "오른발을 뒤로 빼고 뒤꿈치를 바닥에 붙인다.", voiceGuide: "오른발을 이렇게 뒤로 빼고 뒤꿈치를 바닥에 붙입니다. 오른쪽 종아리가 당기면 그대로 유지합니다.", repetitions: null },
    { id: "c3-s3", kind: "REST", startSec: 46, endSec: 53, title: "휴식", instruction: "잠시 쉰다.", voiceGuide: "잠시 쉬어 갑니다. 숨을 고르고, 아프거나 어지러운 곳이 없는지 느껴 봅니다.", repetitions: null },
    { id: "c3-s4", kind: "EXERCISE", startSec: 53, endSec: 81, title: "왼쪽 종아리 늘리기", instruction: "왼발로 같은 동작을 한다.", voiceGuide: "발을 바꿉니다. 왼발을 뒤로 빼고 뒤꿈치를 바닥에 붙인 채 왼쪽 종아리를 늘립니다.", repetitions: null },
    { id: "c3-s5", kind: "OUTRO", startSec: 81, endSec: 90, title: "마무리", instruction: "심호흡하며 마무리한다.", voiceGuide: "운동이 끝났습니다. 어깨에 힘을 빼고 코로 크게 숨을 들이마신 뒤 입으로 천천히 내쉽니다.", repetitions: null },
  ]);

  // 수정 요청 시연용: 준비 구간 없이 시작, 주의사항 없음
  const armSwing = withTts([
    { id: "c4-s1", kind: "EXERCISE", startSec: 0, endSec: 60, title: "앞뒤로 팔 흔들기", instruction: "앉아서 두 팔을 앞뒤로 흔든다.", voiceGuide: "의자에 앉은 채로 두 팔을 앞뒤로 번갈아 흔듭니다.", repetitions: null },
    { id: "c4-s2", kind: "EXERCISE", startSec: 60, endSec: 110, title: "빠르게 흔들기", instruction: "조금 빠르게 흔든다.", voiceGuide: "숨이 편한 만큼 조금 더 빠르게 흔듭니다.", repetitions: null },
    { id: "c4-s3", kind: "OUTRO", startSec: 110, endSec: 120, title: "정리", instruction: "천천히 멈춘다.", voiceGuide: "팔 흔드는 속도를 천천히 줄이고 멈춥니다. 숨을 고릅니다.", repetitions: null },
  ]);

  const demos: ExerciseContent[] = [
    {
      id: "c2",
      title: "의자에 앉아 다리 펴기",
      summary: "의자에 앉아 무릎을 펴며 허벅지 앞쪽 근육을 쓰는 하체 근력 운동입니다.",
      category: "STRENGTH",
      difficulty: "BEGINNER",
      tags: ["하체", "앉아서"],
      precautions: [...DEFAULT_PRECAUTIONS, "무릎에 통증이 있으면 다리를 끝까지 펴지 마세요."],
      video: video("v2"),
      segments: legExtension,
      analysis: { provider: "mock", model: null, analyzedAt: ago(60 * 24), summary: "모의 분석: 100초 영상을 운동 2개 구간으로 나눴습니다." },
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
      title: "벽 짚고 종아리 늘리기",
      summary: "벽을 짚고 서서 종아리 뒤쪽 근육을 늘려 주는 스트레칭입니다.",
      category: "STRETCHING",
      difficulty: "BEGINNER",
      tags: ["종아리", "벽"],
      precautions: [...DEFAULT_PRECAUTIONS],
      video: video("v3"),
      segments: calfStretch,
      analysis: { provider: "mock", model: null, analyzedAt: ago(40), summary: "모의 분석: 90초 영상을 운동 2개 구간으로 나눴습니다." },
      status: "DRAFT",
      aiGenerated: true,
      internalNote: "제작 요청 사항: 발목이 약한 분도 할 수 있게 설명",
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
      title: "앉아서 팔 흔들기",
      summary: "의자에 앉아서 할 수 있는 가벼운 유산소 운동입니다.",
      category: "CARDIO",
      difficulty: "BEGINNER",
      tags: ["유산소", "앉아서"],
      precautions: [],
      video: video("v4"),
      segments: armSwing,
      analysis: null,
      status: "CHANGES_REQUESTED",
      aiGenerated: false,
      internalNote: "",
      reviewComment: "영상 시작 부분에 의자에 바르게 앉는 준비 구간과 주의사항을 추가해 주세요.",
      createdBy: "u-editor",
      submittedBy: "u-editor",
      updatedBy: "u-approver",
      createdAt: ago(60 * 30),
      updatedAt: ago(60 * 5),
      publishedAt: null,
      version: 2,
    },
  ];

  const jobs: FixtureJob[] = [
    {
      id: "j1",
      kind: "CREATE",
      title: "벽 짚고 종아리 늘리기",
      category: "STRETCHING",
      difficulty: "BEGINNER",
      requestNote: "발목이 약한 분도 할 수 있게 설명",
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
    { id: "a1", action: "CONTENT_STATUS_CHANGED", actorId: "u-approver", actorName: "이승인", actorRole: "APPROVER", targetType: "CONTENT", targetId: "c-neck", summary: "승인됨 → 공개 중", createdAt: ago(60 * 24 * 2) },
    { id: "a2", action: "CONTENT_STATUS_CHANGED", actorId: "u-approver", actorName: "이승인", actorRole: "APPROVER", targetType: "CONTENT", targetId: "c4", summary: "검수 중 → 수정 요청 (의견: 영상 시작 부분에 의자에 바르게 앉는 준비 구간과 주의사항을 추가해 주세요.)", createdAt: ago(60 * 5) },
    { id: "a3", action: "CONTENT_STATUS_CHANGED", actorId: "u-editor", actorName: "김편집", actorRole: "EDITOR", targetType: "CONTENT", targetId: "c2", summary: "초안 → 검수 중", createdAt: ago(120) },
    { id: "a4", action: "CONTENT_JOB_CREATED", actorId: "u-editor", actorName: "김편집", actorRole: "EDITOR", targetType: "CONTENT_JOB", targetId: "j1", summary: "제작 작업 생성: 벽 짚고 종아리 늘리기 (wall-calf-stretch.mp4)", createdAt: ago(45) },
    { id: "a5", action: "CONTENT_CREATED", actorId: "u-editor", actorName: "김편집", actorRole: "EDITOR", targetType: "CONTENT", targetId: "c3", summary: "AI 초안 생성 완료: 벽 짚고 종아리 늘리기", createdAt: ago(40) },
  ];

  return { videos, contents: [...catalog, ...demos], jobs, auditLogs };
}
