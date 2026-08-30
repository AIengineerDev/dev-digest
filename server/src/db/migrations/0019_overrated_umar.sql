ALTER TABLE "ci_runs" ADD COLUMN "repo_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "workflow_name" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;