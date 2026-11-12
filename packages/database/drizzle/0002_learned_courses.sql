CREATE TABLE "account_courses" (
	"account_id" text NOT NULL,
	"course_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_courses_account_id_course_id_pk" PRIMARY KEY("account_id","course_id")
);
--> statement-breakpoint
ALTER TABLE "segments" ADD COLUMN "concise_guide" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_courses" ADD CONSTRAINT "account_courses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;