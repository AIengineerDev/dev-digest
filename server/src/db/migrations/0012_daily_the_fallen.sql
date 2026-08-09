ALTER TABLE "conventions" ALTER COLUMN "evidence_path" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ALTER COLUMN "evidence_snippet" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ALTER COLUMN "confidence" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "conventions" ALTER COLUMN "confidence" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "category" text DEFAULT 'structure' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "rationale" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_line" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "conventions_repo_idx" ON "conventions" USING btree ("repo_id");