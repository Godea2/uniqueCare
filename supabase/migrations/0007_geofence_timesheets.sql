-- Geofenced clock-in/out + timesheets
-- Idempotent. Run in the Supabase SQL editor after 0006_staff_rota_v2.sql.

-- Pay rate used for timesheet gross pay (GBP per hour)
alter table public.staff_profiles
  add column if not exists hourly_rate numeric(8, 2);

comment on column public.staff_profiles.hourly_rate is
  'GBP hourly rate for payroll / timesheets. Snapshotted onto each attendance row at clock-out.';

-- One attendance session per staff member per visit
create table if not exists public.visit_attendance (
  id bigint generated always as identity primary key,
  visit_id bigint not null references public.visits (id) on delete cascade,
  staff_id bigint not null references public.staff_profiles (id),
  assignment_id bigint references public.visit_assignments (id) on delete set null,
  clock_in_at timestamptz not null,
  clock_in_lat numeric not null,
  clock_in_lng numeric not null,
  clock_in_accuracy_m numeric,
  clock_out_at timestamptz,
  clock_out_lat numeric,
  clock_out_lng numeric,
  clock_out_accuracy_m numeric,
  -- completed | early_client_request | early_no_access | early_emergency | early_other | auto_left_geofence
  clock_out_reason text,
  early_reason_text text,
  -- in_progress | completed | auto_closed
  status text not null default 'in_progress',
  left_geofence_at timestamptz,
  paid_minutes integer,
  unpaid_grace_minutes integer default 0,
  hourly_rate_snapshot numeric(8, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists visit_attendance_open_uniq
  on public.visit_attendance (visit_id, staff_id)
  where status = 'in_progress';

create index if not exists visit_attendance_staff_idx
  on public.visit_attendance (staff_id, clock_in_at desc);

create index if not exists visit_attendance_visit_idx
  on public.visit_attendance (visit_id);

-- 15-minute location probes while a visit is in progress
create table if not exists public.visit_location_probes (
  id bigint generated always as identity primary key,
  attendance_id bigint not null references public.visit_attendance (id) on delete cascade,
  visit_id bigint not null references public.visits (id) on delete cascade,
  staff_id bigint not null references public.staff_profiles (id),
  at timestamptz not null default now(),
  lat numeric not null,
  lng numeric not null,
  accuracy_m numeric,
  distance_m numeric not null,
  inside_geofence boolean not null,
  violation_notified boolean not null default false
);

create index if not exists visit_location_probes_attendance_idx
  on public.visit_location_probes (attendance_id, at desc);

alter table public.visit_attendance enable row level security;
alter table public.visit_location_probes enable row level security;
