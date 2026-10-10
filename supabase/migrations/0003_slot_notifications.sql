-- UniqueCare Connect: per-slot choice to email candidates who become ready to book later.
-- Safe to run more than once. Run it in the Supabase SQL editor.

alter table public.interview_slots
  add column if not exists notify_new_candidates boolean not null default true;
