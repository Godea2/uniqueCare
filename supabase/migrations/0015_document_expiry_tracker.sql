-- Document expiry tracker: reminder ledger, automation rules, RTW expiry policy.
-- Safe / idempotent. Run in the Supabase SQL editor.

create table if not exists public.document_expiry_reminders (
  id bigint generated always as identity primary key,
  subject_type text not null,
  subject_id bigint not null,
  last_reminded_at timestamptz,
  last_level text,
  reminder_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_expiry_reminders_subject_uidx unique (subject_type, subject_id)
);

create index if not exists document_expiry_reminders_level_idx
  on public.document_expiry_reminders (last_level);

alter table public.document_expiry_reminders enable row level security;

comment on table public.document_expiry_reminders is
  'Escalating reminder state for compliance docs, training, and plan reviews.';

-- Restore / upsert expiry automation switches (removed by 0002_production for unused keys).
insert into public.automation_rules (key, label, description, enabled)
values
  (
    'expiry_alerts',
    'Compliance & training expiry alerts',
    'Notify the carer plus admin, HR, care coordinator and registered manager at 60/30/7 days before expiry, then daily once expired.',
    true
  ),
  (
    'plan_review_alerts',
    'Care & support plan review alerts',
    'Notify the care coordinator and registered manager 30/7 days before a plan review is due; escalate daily when overdue.',
    true
  )
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description;

-- Driving licence already has 12 months; encourage RTW share-code renewals (6 months typical).
update public.compliance_requirements
set expires_after_months = 6
where key = 'right_to_work' and expires_after_months is null;

create index if not exists compliance_documents_expires_at_idx
  on public.compliance_documents (expires_at)
  where expires_at is not null;

create index if not exists plan_reviews_due_date_idx
  on public.plan_reviews (due_date);
