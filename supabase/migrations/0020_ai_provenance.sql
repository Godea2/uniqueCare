-- AI transparency: which plan/review sections were AI-drafted and when
alter table public.care_plans
  add column if not exists ai_provenance jsonb;

alter table public.plan_reviews
  add column if not exists ai_provenance jsonb;

comment on column public.care_plans.ai_provenance is 'Per-section AI draft markers { lastGeneratedAt, lastModel, lastActorName, sections }';
comment on column public.plan_reviews.ai_provenance is 'Per-section AI draft markers for review reports';
