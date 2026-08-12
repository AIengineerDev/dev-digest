ALTER TABLE "pr_intent" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "confidence" double precision;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "band" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "prompt_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "degraded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "derived_at" timestamp with time zone;