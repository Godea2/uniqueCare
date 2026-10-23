-- Candidate-scoped interview slots: office can propose private times for one application.
ALTER TABLE "interview_slots"
  ADD COLUMN IF NOT EXISTS "application_id" bigint REFERENCES "applications"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "interview_slots_application_id_idx"
  ON "interview_slots" ("application_id");
