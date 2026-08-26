CREATE TABLE "onboarding_tours" (
	"repo_id" uuid NOT NULL,
	"indexed_sha" text NOT NULL,
	"indexer_version" integer NOT NULL,
	"prompt_version" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"degraded" boolean DEFAULT false NOT NULL,
	"error" text,
	"skeleton_sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dropped_inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dropped_refs" integer DEFAULT 0 NOT NULL,
	"dropped_steps" integer DEFAULT 0 NOT NULL,
	"index_status" text,
	"files_skipped" integer,
	"trace" jsonb NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "onboarding_tours_repo_id_indexed_sha_indexer_version_prompt_version_provider_model_pk" PRIMARY KEY("repo_id","indexed_sha","indexer_version","prompt_version","provider","model")
);
--> statement-breakpoint
ALTER TABLE "onboarding_tours" ADD CONSTRAINT "onboarding_tours_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;