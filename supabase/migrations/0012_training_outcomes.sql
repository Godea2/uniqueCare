-- Training pass/fail outcomes with stored certificate / outcome-letter PDFs.
-- Safe / idempotent. Run in the Supabase SQL editor.

alter table public.training_enrolments
  add column if not exists outcome text,
  add column if not exists outcome_at timestamptz,
  add column if not exists outcome_notes text,
  add column if not exists outcome_file_key text,
  add column if not exists outcome_file_name text;

comment on column public.training_enrolments.outcome is 'pass | fail';
comment on column public.training_enrolments.outcome_file_key is
  'Storage key for the certificate (pass) or outcome letter (fail) PDF.';
