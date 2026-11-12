/**
 * 데이터베이스 테이블 정의 (Drizzle ORM). 설계 설명은 docs/database.md 에 있다.
 * 값의 종류(상태, 역할 등)는 @yconic/shared-types 의 목록을 그대로 써서, 화면·API·DB가 같은 값을 쓴다.
 */
import {
  ADMIN_ROLES,
  AUDIT_ACTIONS,
  CONTENT_JOB_KINDS,
  CONTENT_JOB_STATUSES,
  CONTENT_STATUSES,
  DIFFICULTIES,
  EXERCISE_CATEGORIES,
  SEGMENT_KINDS,
  TTS_STATUSES,
  type AnalysisInfo,
  type NarrationLine,
  type PersonalizedSegmentGuide,
} from "@yconic/shared-types";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── 값의 종류 ──
export const adminRole = pgEnum("admin_role", ADMIN_ROLES);
export const contentStatus = pgEnum("content_status", CONTENT_STATUSES);
export const exerciseCategory = pgEnum("exercise_category", EXERCISE_CATEGORIES);
export const difficulty = pgEnum("difficulty", DIFFICULTIES);
export const segmentKind = pgEnum("segment_kind", SEGMENT_KINDS);
export const ttsStatus = pgEnum("tts_status", TTS_STATUSES);
export const contentJobStatus = pgEnum("content_job_status", CONTENT_JOB_STATUSES);
export const contentJobKind = pgEnum("content_job_kind", CONTENT_JOB_KINDS);
export const auditAction = pgEnum("audit_action", AUDIT_ACTIONS);
export const auditTargetType = pgEnum("audit_target_type", ["CONTENT", "CONTENT_JOB", "VIDEO"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ── 계정과 로그인 ──

/** 로그인 계정. 일반 회원은 admin_role이 비어 있고, 관리자는 역할이 있다. */
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** scrypt 해시 (평문 비밀번호는 저장하지 않는다) */
  passwordHash: text("password_hash").notNull(),
  adminRole: adminRole("admin_role"),
  createdAt: createdAt(),
});

/** 로그인 유지 토큰. 토큰 원문은 저장하지 않고 SHA-256 해시만 둔다. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("auth_sessions_account_idx").on(t.accountId)],
);

/** 회원이 강사에게 배운 강의 (내 강의). 배운 강의의 운동은 짧게 안내한다 (docs/decisions/0007) */
export const accountCourses = pgTable(
  "account_courses",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** shared-types LEARNED_COURSE_IDS 중 하나 */
    courseId: text("course_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.courseId] })],
);

/**
 * 회원이 동작에 대해 아는 것 (학습 프로필, docs/decisions/0008).
 * 강의로 배운 동작은 account_courses에서 따로 계산하고, 여기에는 직접 알린 것과 연습 횟수를 둔다.
 */
export const accountMovements = pgTable(
  "account_movements",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** shared-types MOVEMENT_IDS 중 하나 */
    movementId: text("movement_id").notNull(),
    /** "스쿼트 배웠어"처럼 직접 알렸는지 */
    declared: boolean("declared").notNull().default(false),
    /** 앱에서 그 동작 단계를 끝까지 따라 한 횟수 */
    practiceCount: integer("practice_count").notNull().default(0),
    /** 강사에게 배운 용어나 신호. AI 맞춤 안내가 쓴다 */
    terms: text("terms").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.movementId] })],
);

/** AI가 회원 한 사람에게 맞춰 다시 쓴 단계별 안내. 프로필이나 콘텐츠가 바뀌면 다시 만든다 */
export const personalizedGuides = pgTable(
  "personalized_guides",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    contentId: text("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    /** 만들 때의 콘텐츠 버전과 관련 학습 프로필을 묶은 값. 다르면 다시 만든다 */
    profileKey: text("profile_key").notNull(),
    guides: jsonb("guides").$type<PersonalizedSegmentGuide[]>().notNull(),
    /** "ai" 또는 "rule" */
    generatedBy: text("generated_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.contentId] })],
);

// ── 영상과 콘텐츠 ──

/** 관리자가 올린 운동 영상 파일. 파일 자체는 저장소(지금은 API 서버 폴더, 나중에 S3)에 있다. */
export const videos = pgTable("videos", {
  id: text("id").primaryKey(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  durationSec: doublePrecision("duration_sec").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  /** 저장소 안의 파일 이름. 예시 데이터처럼 파일이 없으면 null */
  storageKey: text("storage_key"),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => accounts.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 운동 콘텐츠 = 영상 + 구간별 음성 안내 (docs/decisions/0002) */
export const contents = pgTable(
  "contents",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    category: exerciseCategory("category").notNull(),
    difficulty: difficulty("difficulty").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    precautions: text("precautions").array().notNull().default(sql`'{}'::text[]`),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id),
    analysis: jsonb("analysis").$type<AnalysisInfo>(),
    status: contentStatus("status").notNull().default("DRAFT"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    /** 관리자 내부 메모. 사용자 API로는 절대 내보내지 않는다. */
    internalNote: text("internal_note").notNull().default(""),
    reviewComment: text("review_comment"),
    createdBy: text("created_by")
      .notNull()
      .references(() => accounts.id),
    /** 마지막으로 검수를 요청한 사람 (자기 승인 금지, docs/decisions/0003) */
    submittedBy: text("submitted_by").references(() => accounts.id),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => accounts.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** 저장할 때마다 1씩 올린다 (동시 수정 충돌 감지) */
    version: integer("version").notNull().default(1),
  },
  (t) => [index("contents_status_idx").on(t.status), index("contents_updated_idx").on(t.updatedAt)],
);

/** 영상 타임라인 위의 구간. 사용자 화면은 구간 시작 시각에 voice_guide를 들려준다. */
export const segments = pgTable(
  "segments",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    /** 1부터 시작하는 순서 */
    position: integer("position").notNull(),
    kind: segmentKind("kind").notNull(),
    startSec: doublePrecision("start_sec").notNull(),
    endSec: doublePrecision("end_sec").notNull(),
    title: text("title").notNull().default(""),
    instruction: text("instruction").notNull().default(""),
    voiceGuide: text("voice_guide").notNull().default(""),
    /** 동작을 배운 사람에게 읽어 주는 짧은 안내. 비어 있으면 voice_guide를 읽는다 (docs/decisions/0007) */
    conciseGuide: text("concise_guide").notNull().default(""),
    /** 이 단계의 동작 (shared-types MOVEMENT_IDS). 사용자가 아는 동작이면 짧게 안내한다 (docs/decisions/0008) */
    movements: text("movements").array().notNull().default(sql`'{}'::text[]`),
    /** 이 단계에서 영상 속 강사가 말한 것 (받아쓰기). 음성 안내를 켜면 이 시간에 영상 소리를 끈다 (docs/decisions/0009) */
    narration: jsonb("narration").$type<NarrationLine[]>().notNull().default(sql`'[]'::jsonb`),
    repetitions: integer("repetitions"),
    // 음성 파일(TTS). 서버가 관리하며, 화면에서 보낸 값으로 바꾸지 않는다.
    ttsStatus: ttsStatus("tts_status").notNull().default("NONE"),
    ttsAudioUrl: text("tts_audio_url"),
    ttsGeneratedForText: text("tts_generated_for_text"),
    ttsFailureReason: text("tts_failure_reason"),
    /** 음성 생성을 요청한 시각과 그때의 안내문 (작업기가 처리한다) */
    ttsRequestedAt: timestamp("tts_requested_at", { withTimezone: true }),
    ttsPendingText: text("tts_pending_text"),
  },
  (t) => [uniqueIndex("segments_content_position_uq").on(t.contentId, t.position)],
);

// ── AI 제작 작업 ──

/** 영상 하나를 분석하는 작업 (새 콘텐츠 제작 또는 다시 분석) */
export const contentJobs = pgTable(
  "content_jobs",
  {
    id: text("id").primaryKey(),
    kind: contentJobKind("kind").notNull(),
    title: text("title").notNull(),
    category: exerciseCategory("category").notNull(),
    difficulty: difficulty("difficulty").notNull(),
    requestNote: text("request_note").notNull().default(""),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id),
    status: contentJobStatus("status").notNull().default("QUEUED"),
    progress: integer("progress").notNull().default(0),
    failureReason: text("failure_reason"),
    /** CREATE: 완료 후 만든 초안 / REANALYZE: 대상 콘텐츠 */
    contentId: text("content_id").references(() => contents.id, { onDelete: "set null" }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => accounts.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** 작업기가 이 시각부터 단계를 진행한다 (다시 시도하면 새로 잡는다) */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** 개발용: 실패 상황 시연 (파일 이름에 fail) */
    simulateFailure: boolean("simulate_failure").notNull().default(false),
  },
  (t) => [index("content_jobs_status_idx").on(t.status), index("content_jobs_content_idx").on(t.contentId)],
);

// ── 감사 로그 ──

/** 모든 생성·수정·승인·공개 기록 (설계 문서 4장). 작업기도 쓰므로 실행자는 계정 참조를 걸지 않는다. 회원도 콘텐츠를 올린다 (docs/decisions/0007). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    action: auditAction("action").notNull(),
    actorId: text("actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    /** 관리자 역할. 일반 회원(콘텐츠를 올린 사람)이면 비어 있다 */
    actorRole: adminRole("actor_role"),
    targetType: auditTargetType("target_type").notNull(),
    targetId: text("target_id").notNull(),
    summary: text("summary").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_target_idx").on(t.targetId), index("audit_logs_created_idx").on(t.createdAt)],
);
