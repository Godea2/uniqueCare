-- 5-day flex: configurable flexible day off (was hardcoded to Sunday in the rota engine).
-- Safe / idempotent. Run in the Supabase SQL editor if not applied by migrate.

alter table public.staff_profiles
  add column if not exists flexible_day_off integer;

comment on column public.staff_profiles.flexible_day_off is
  '0=Mon .. 6=Sun. Second day off when work_pattern = five_day_flex. Defaults to Sunday (6) in the engine when null.';

-- Existing five_day_flex workers keep Sunday as the flexible day.
update public.staff_profiles
set flexible_day_off = 6
where work_pattern = 'five_day_flex'
  and flexible_day_off is null;
