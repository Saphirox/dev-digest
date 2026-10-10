ALTER TABLE "ci_installations" ADD COLUMN IF NOT EXISTS "agent_version" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN IF NOT EXISTS "manifest" jsonb;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN IF NOT EXISTS "repo" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN IF NOT EXISTS "github_run_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN IF NOT EXISTS "run_attempt" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN IF NOT EXISTS "agent_run_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ci_runs_workspace_id_workspaces_id_fk') THEN
    ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ci_runs_agent_run_id_agent_runs_id_fk') THEN
    ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ci_runs_workspace_github_run_uq" ON "ci_runs" USING btree ("workspace_id","github_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ci_runs_workspace_ran_at_idx" ON "ci_runs" USING btree ("workspace_id","ran_at" DESC NULLS LAST);
