CREATE TYPE "public"."admin_role" AS ENUM('VIEWER', 'EDITOR', 'APPROVER', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('CONTENT_JOB_CREATED', 'CONTENT_JOB_RETRIED', 'CONTENT_CREATED', 'CONTENT_UPDATED', 'CONTENT_STATUS_CHANGED', 'CONTENT_VIDEO_REPLACED', 'CONTENT_REANALYZED', 'TTS_REQUESTED', 'VIDEO_DELETED');--> statement-breakpoint
CREATE TYPE "public"."audit_target_type" AS ENUM('CONTENT', 'CONTENT_JOB', 'VIDEO');--> statement-breakpoint
CREATE TYPE "public"."content_job_kind" AS ENUM('CREATE', 'REANALYZE');--> statement-breakpoint
CREATE TYPE "public"."content_job_status" AS ENUM('QUEUED', 'ANALYZING_VIDEO', 'EXTRACTING_STEPS', 'GENERATING_SCRIPT', 'GENERATING_TTS', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."difficulty" AS ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED');--> statement-breakpoint
CREATE TYPE "public"."exercise_category" AS ENUM('STRETCHING', 'STRENGTH', 'CARDIO', 'BALANCE', 'REHAB');--> statement-breakpoint
CREATE TYPE "public"."segment_kind" AS ENUM('INTRO', 'EXERCISE', 'REST', 'OUTRO');--> statement-breakpoint
CREATE TYPE "public"."tts_status" AS ENUM('NONE', 'REQUESTED', 'GENERATING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"admin_role" "admin_role",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"action" "audit_action" NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" "admin_role" NOT NULL,
	"target_type" "audit_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "content_job_kind" NOT NULL,
	"title" text NOT NULL,
	"category" "exercise_category" NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"request_note" text DEFAULT '' NOT NULL,
	"video_id" text NOT NULL,
	"status" "content_job_status" DEFAULT 'QUEUED' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"content_id" text,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"simulate_failure" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"category" "exercise_category" NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"precautions" text[] DEFAULT '{}'::text[] NOT NULL,
	"video_id" text NOT NULL,
	"analysis" jsonb,
	"status" "content_status" DEFAULT 'DRAFT' NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"internal_note" text DEFAULT '' NOT NULL,
	"review_comment" text,
	"created_by" text NOT NULL,
	"submitted_by" text,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" text PRIMARY KEY NOT NULL,
	"content_id" text NOT NULL,
	"position" integer NOT NULL,
	"kind" "segment_kind" NOT NULL,
	"start_sec" double precision NOT NULL,
	"end_sec" double precision NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"instruction" text DEFAULT '' NOT NULL,
	"voice_guide" text DEFAULT '' NOT NULL,
	"repetitions" integer,
	"tts_status" "tts_status" DEFAULT 'NONE' NOT NULL,
	"tts_audio_url" text,
	"tts_generated_for_text" text,
	"tts_failure_reason" text,
	"tts_requested_at" timestamp with time zone,
	"tts_pending_text" text
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" text PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"duration_sec" double precision NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"storage_key" text,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_jobs" ADD CONSTRAINT "content_jobs_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_jobs" ADD CONSTRAINT "content_jobs_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_jobs" ADD CONSTRAINT "content_jobs_requested_by_accounts_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_submitted_by_accounts_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_updated_by_accounts_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_uploaded_by_accounts_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_account_idx" ON "auth_sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "content_jobs_status_idx" ON "content_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_jobs_content_idx" ON "content_jobs" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "contents_status_idx" ON "contents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contents_updated_idx" ON "contents" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_content_position_uq" ON "segments" USING btree ("content_id","position");