-- UniqueCare Connect: how a training session is delivered, who runs it, and the trainer's
-- private attendance-register link. Safe to run more than once. Run it in the Supabase SQL editor.

alter table public.training_sessions
  add column if not exists delivery text not null default 'in_person',
  add column if not exists meeting_url text,
  add column if not exists trainer_staff_id bigint,
  add column if not exists trainer_email text,
  add column if not exists notes text,
  add column if not exists register_token text,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists training_sessions_register_token_key
  on public.training_sessions (register_token) where register_token is not null;

update public.training_sessions
  set register_token = md5(random()::text || clock_timestamp()::text || id::text) || md5(random()::text)
  where register_token is null;
