ALTER TABLE "accounts" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "google_sub" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_google_sub_unique" UNIQUE("google_sub");