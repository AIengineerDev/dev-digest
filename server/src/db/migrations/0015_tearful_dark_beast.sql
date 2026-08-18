CREATE TABLE "pr_brief_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pr_id" uuid NOT NULL,
	"head_sha" text NOT NULL,
	"intent_fingerprint" text,
	"repo_indexed_sha" text,
	"prompt_version" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"what" text NOT NULL,
	"why" text NOT NULL,
	"risk_level" text NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_focus" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"cost_usd" double precision,
	"budget_tokens" integer NOT NULL,
	"dropped_inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dropped_refs" integer DEFAULT 0 NOT NULL,
	"degraded" boolean DEFAULT false NOT NULL,
	"error" text,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pr_brief_records" ADD CONSTRAINT "pr_brief_records_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pr_brief_records_state_uq" ON "pr_brief_records" USING btree ("pr_id","head_sha",COALESCE("intent_fingerprint", ''),COALESCE("repo_indexed_sha", ''),"prompt_version","provider","model");