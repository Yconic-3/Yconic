CREATE TABLE "account_movements" (
	"account_id" text NOT NULL,
	"movement_id" text NOT NULL,
	"declared" boolean DEFAULT false NOT NULL,
	"practice_count" integer DEFAULT 0 NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_movements_account_id_movement_id_pk" PRIMARY KEY("account_id","movement_id")
);
--> statement-breakpoint
CREATE TABLE "personalized_guides" (
	"account_id" text NOT NULL,
	"content_id" text NOT NULL,
	"profile_key" text NOT NULL,
	"guides" jsonb NOT NULL,
	"generated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personalized_guides_account_id_content_id_pk" PRIMARY KEY("account_id","content_id")
);
--> statement-breakpoint
ALTER TABLE "segments" ADD COLUMN "movements" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personalized_guides" ADD CONSTRAINT "personalized_guides_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personalized_guides" ADD CONSTRAINT "personalized_guides_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;