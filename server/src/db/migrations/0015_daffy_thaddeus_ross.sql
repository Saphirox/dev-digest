DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conventions_evidence_line_ck') THEN
    ALTER TABLE "conventions" ADD CONSTRAINT "conventions_evidence_line_ck" CHECK ("conventions"."evidence_line" >= 1);
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conventions_occurrences_ck') THEN
    ALTER TABLE "conventions" ADD CONSTRAINT "conventions_occurrences_ck" CHECK ("conventions"."occurrences" >= 0);
  END IF;
END $$;
