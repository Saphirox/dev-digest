ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "context_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "context_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;
