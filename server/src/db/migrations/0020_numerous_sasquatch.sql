ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "multi_agent_run_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_runs_multi_agent_run_id_multi_agent_runs_id_fk') THEN
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_multi_agent_run_id_multi_agent_runs_id_fk" FOREIGN KEY ("multi_agent_run_id") REFERENCES "public"."multi_agent_runs"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_multi_agent_run_idx" ON "agent_runs" USING btree ("multi_agent_run_id");
