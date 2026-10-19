-- Care plan review report fields (paper review form + AI draft)
-- Extends plan_reviews with content, meeting notes, lock and completer.

alter table public.plan_reviews
  add column if not exists meeting_notes text,
  add column if not exists content jsonb,
  add column if not exists ai_generated_at timestamptz,
  add column if not exists ai_model text,
  add column if not exists completed_by text,
  add column if not exists locked_at timestamptz,
  add column if not exists updated_at timestamptz default now() not null;

comment on column public.plan_reviews.content is 'Structured care plan review report (paper form sections + 21-area checklist)';
comment on column public.plan_reviews.meeting_notes is 'Manager meeting notes used for AI draft';
comment on column public.plan_reviews.locked_at is 'Set when review is completed — report is read-only thereafter';
