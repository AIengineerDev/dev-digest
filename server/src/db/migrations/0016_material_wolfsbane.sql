CREATE TABLE "project_context_attachments" (
	"workspace_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"path" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_context_attachments_repo_id_path_target_kind_target_id_pk" PRIMARY KEY("repo_id","path","target_kind","target_id")
);
--> statement-breakpoint
ALTER TABLE "project_context_attachments" ADD CONSTRAINT "project_context_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_context_attachments" ADD CONSTRAINT "project_context_attachments_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;