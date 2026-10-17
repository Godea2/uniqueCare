-- Staff 360 + Rota engine v2 (CQC-aligned scheduling rules)
-- Safe / idempotent: only adds columns with defaults. Does not touch auth or recruitment data.
-- Run this in the Supabase SQL editor against your existing UniqueCare project.

-- Staff: student flag (20h/week incl. travel) + work pattern for days-off rules
alter table public.staff_profiles
  add column if not exists is_student boolean not null default false;

alter table public.staff_profiles
  add column if not exists work_pattern text not null default 'six_day';

alter table public.staff_profiles
  add column if not exists fixed_day_off integer;

comment on column public.staff_profiles.is_student is
  'When true, rota engine caps this worker at 20 hours/week including travel time.';
comment on column public.staff_profiles.work_pattern is
  'six_day (Sunday off) or five_day_flex (fixed day off + flexible Sunday).';
comment on column public.staff_profiles.fixed_day_off is
  '0=Mon .. 6=Sun. Used when work_pattern = five_day_flex.';

-- Clients: time-critical / medication flag → ±30 min visit window (CQC standard)
alter table public.clients
  add column if not exists time_critical boolean not null default false;

comment on column public.clients.time_critical is
  'When true, visit time window is ±30 minutes (CQC). Otherwise ±flexibility_minutes (default 60).';

-- Visit templates: prefer a 60-minute window for non-time-critical clients going forward.
-- Existing rows keep their current flexibility_minutes; only the column default changes.
alter table public.visit_templates
  alter column flexibility_minutes set default 60;

-- Optional: bump legacy default of 15 → 60 where it was never customised.
-- Comment out this UPDATE if you intentionally use 15-minute windows already.
update public.visit_templates
set flexibility_minutes = 60
where flexibility_minutes is null or flexibility_minutes = 15;
