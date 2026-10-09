-- UniqueCare Connect schema for Supabase (Postgres).
-- Run this in the Supabase SQL editor (or supabase db push) before starting the app.
-- The API uses the service role key, which bypasses row level security.
-- RLS is enabled with no policies so the anon key cannot read these tables.

create table if not exists public.ai_runs (
  id bigint generated always as identity primary key,
  feature text not null,
  model text,
  prompt_version text,
  latency_ms integer,
  tokens integer,
  status text not null,
  error text,
  created_at timestamptz default now() not null
);

create table if not exists public.application_forms (
  id bigint generated always as identity primary key,
  job_posting_id bigint not null,
  template_id bigint,
  name text not null,
  draft_schema jsonb,
  published_version_id bigint,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.application_form_templates (
  id bigint generated always as identity primary key,
  name text not null,
  status text default 'active' not null,
  schema_json jsonb,
  created_by text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.application_form_versions (
  id bigint generated always as identity primary key,
  form_id bigint not null,
  version integer not null,
  schema_json jsonb not null,
  published_by text,
  created_at timestamptz default now() not null
);

create table if not exists public.applications (
  id bigint generated always as identity primary key,
  job_posting_id bigint not null,
  candidate_id bigint not null,
  cv_text text,
  cv_file_name text,
  answers jsonb,
  ai_score integer,
  ai_breakdown jsonb,
  ai_summary text,
  ai_flags jsonb,
  stage text default 'applied' not null,
  stage_history jsonb,
  rejection_reason text,
  admin_override boolean default false,
  override_reason text,
  portal_token text not null unique,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  cv_file_key text,
  source_channel text,
  form_version_id bigint,
  cv_unreadable boolean default false
);

create table if not exists public.appraisals (
  id bigint generated always as identity primary key,
  staff_id bigint not null,
  period_start date not null,
  period_end date not null,
  appraiser_id bigint,
  appraiser_name text,
  ai_draft jsonb,
  final jsonb,
  status text default 'draft' not null,
  signed_by_staff_at timestamptz,
  next_appraisal_due date,
  created_at timestamptz default now() not null
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id text,
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id text,
  detail jsonb,
  at timestamptz default now() not null
);

create table if not exists public.automation_rules (
  id bigint generated always as identity primary key,
  key text not null unique,
  label text not null,
  description text,
  enabled boolean default true,
  last_run_at timestamptz,
  last_status text default 'never',
  last_error text
);

create table if not exists public.candidates (
  id bigint generated always as identity primary key,
  user_id bigint,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  postcode text,
  right_to_work_status text,
  has_driving_licence boolean default false,
  has_vehicle boolean default false,
  source_channel text,
  created_at timestamptz default now() not null
);

create table if not exists public.care_packages (
  id bigint generated always as identity primary key,
  client_id bigint not null,
  effective_from date not null,
  effective_to date,
  commissioned_hours_per_week numeric not null,
  notes text
);

create table if not exists public.care_plans (
  id bigint generated always as identity primary key,
  client_id bigint not null,
  template_id bigint,
  plan_type text default 'care' not null,
  version integer default 1 not null,
  status text default 'draft' not null,
  inputs jsonb,
  content jsonb,
  ai_model text,
  ai_generated_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  next_review_due date,
  change_reason text,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.client_assigned_workers (
  id bigint generated always as identity primary key,
  client_id bigint not null,
  staff_id bigint not null,
  is_primary boolean default false
);

create table if not exists public.client_change_events (
  id bigint generated always as identity primary key,
  client_id bigint not null,
  type text not null,
  description text not null,
  reported_by text,
  occurred_at timestamptz not null,
  triggers_review boolean default false,
  created_at timestamptz default now() not null
);

create table if not exists public.client_preferences (
  id bigint generated always as identity primary key,
  client_id bigint not null,
  preferred_gender text default 'any',
  preferred_language text,
  preferred_staff_ids jsonb,
  excluded_staff_ids jsonb,
  pets_in_home boolean default false,
  smoking_in_home boolean default false,
  cultural_religious_notes text,
  communication_needs text,
  other_notes text
);

create table if not exists public.client_required_skills (
  id bigint generated always as identity primary key,
  client_id bigint not null,
  skill text not null
);

create table if not exists public.clients (
  id bigint generated always as identity primary key,
  client_ref text not null unique,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  dob date,
  gender text,
  address_line1 text,
  town text,
  postcode text,
  lat numeric,
  lng numeric,
  access_notes text,
  phone text,
  gp_details text,
  next_of_kin jsonb,
  funding_source text default 'local_authority' not null,
  status text default 'active' not null,
  start_date date,
  end_date date,
  risk_level text default 'low' not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.compliance_documents (
  id bigint generated always as identity primary key,
  owner_type text not null,
  owner_id bigint not null,
  requirement_key text not null,
  file_name text,
  status text default 'requested' not null,
  verified_by text,
  verified_at timestamptz,
  expires_at date,
  rejection_reason text,
  created_at timestamptz default now() not null
);

create table if not exists public.compliance_requirements (
  id bigint generated always as identity primary key,
  key text not null unique,
  label text not null,
  applies_to text default 'candidate' not null,
  required boolean default true,
  expires_after_months integer
);

create table if not exists public.crm_contact_relationships (
  id bigint generated always as identity primary key,
  contact_id bigint not null,
  related_contact_id bigint not null,
  relationship text not null
);

create table if not exists public.crm_contacts (
  id bigint generated always as identity primary key,
  contact_type text not null,
  first_name text not null,
  last_name text not null,
  organisation_id bigint,
  job_title text,
  email text,
  phone text,
  address text,
  postcode text,
  preferred_channel text default 'phone',
  communication_notes text,
  linked_client_id bigint,
  linked_staff_id bigint,
  linked_candidate_id bigint,
  owner_id bigint,
  lifecycle_stage text default 'n_a',
  tags jsonb,
  do_not_contact boolean default false,
  source text,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.crm_organisations (
  id bigint generated always as identity primary key,
  name text not null,
  type text default 'other',
  phone text,
  address text,
  notes text,
  created_at timestamptz default now() not null
);

create table if not exists public.cv_versions (
  id bigint generated always as identity primary key,
  application_id bigint not null,
  file_key text not null,
  file_name text,
  size_bytes integer,
  mime_type text,
  extracted_text text,
  extract_status text default 'pending' not null,
  created_at timestamptz default now() not null
);

create table if not exists public.dbs_verifications (
  id bigint generated always as identity primary key,
  application_id bigint,
  staff_id bigint,
  certificate_no text not null,
  sighted_original boolean default false,
  update_service_checked boolean default false,
  barred_list_adults_checked boolean default false,
  verified_by text,
  verified_at timestamptz,
  notes text,
  created_at timestamptz default now() not null
);

create table if not exists public.document_templates (
  id bigint generated always as identity primary key,
  kind text not null,
  version integer default 1 not null,
  name text not null,
  structure jsonb,
  example_text text,
  active boolean default true,
  created_at timestamptz default now() not null
);

create table if not exists public.email_outbox (
  id bigint generated always as identity primary key,
  to_email text not null,
  subject text not null,
  body_text text,
  kind text not null,
  status text default 'queued' not null,
  related_type text,
  related_id text,
  created_at timestamptz default now() not null
);

create table if not exists public.incidents (
  id bigint generated always as identity primary key,
  client_id bigint,
  staff_id bigint,
  occurred_at timestamptz not null,
  category text not null,
  description text not null,
  severity text default 'low' not null,
  actions_taken text,
  notifiable_to_cqc boolean default false,
  status text default 'open' not null,
  created_at timestamptz default now() not null
);

create table if not exists public.interactions (
  id bigint generated always as identity primary key,
  type text not null,
  direction text not null,
  contact_id bigint,
  client_id bigint,
  ticket_id bigint,
  subject text,
  body text,
  summary_ai text,
  sentiment text,
  occurred_at timestamptz not null,
  duration_seconds integer,
  logged_by text,
  outcome text,
  created_at timestamptz default now() not null
);

create table if not exists public.interview_bookings (
  id bigint generated always as identity primary key,
  slot_id bigint not null,
  application_id bigint not null,
  status text default 'booked' not null,
  created_at timestamptz default now() not null
);

create table if not exists public.interview_scorecards (
  id bigint generated always as identity primary key,
  application_id bigint not null,
  panel_member_id bigint not null,
  scores jsonb,
  total numeric,
  recommendation text,
  submitted_at timestamptz
);

create table if not exists public.interview_slots (
  id bigint generated always as identity primary key,
  job_posting_id bigint,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  panel_member_ids jsonb,
  capacity integer default 1,
  teams_meeting_url text,
  location_text text,
  created_at timestamptz default now() not null
);

create table if not exists public.job_link_sources (
  id bigint generated always as identity primary key,
  job_posting_id bigint not null,
  label text not null,
  slug text not null,
  created_by text,
  created_at timestamptz default now() not null
);

create table if not exists public.job_postings (
  id bigint generated always as identity primary key,
  title text not null,
  location text,
  postcode text,
  salary_text text,
  employment_type text default 'full_time' not null,
  description_md text,
  requirements jsonb,
  screening_threshold integer default 85,
  status text default 'draft' not null,
  closes_at date,
  public_slug text not null unique,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  apply_slug text unique,
  apply_link_enabled boolean default true not null,
  apply_link_created_at timestamptz,
  application_form_id bigint
);

create table if not exists public.mentions (
  id bigint generated always as identity primary key,
  mentioned_staff_id bigint not null,
  by_name text,
  source_type text not null,
  source_id bigint,
  source_label text,
  read_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id bigint,
  staff_id bigint,
  channel text default 'in_app' not null,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists public.offer_letters (
  id bigint generated always as identity primary key,
  application_id bigint not null,
  template_version text default 'v1',
  content text,
  sent_at timestamptz,
  accepted_at timestamptz,
  signature_name text,
  signature_ip text,
  created_at timestamptz default now() not null
);

create table if not exists public.organisations (
  id bigint generated always as identity primary key,
  name text not null,
  cqc_location_id text,
  address text,
  logo_url text,
  settings jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.plan_reviews (
  id bigint generated always as identity primary key,
  plan_type text not null,
  plan_id bigint not null,
  client_id bigint,
  due_date date not null,
  trigger text not null,
  status text default 'due' not null,
  completed_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists public.pre_interview_forms (
  id bigint generated always as identity primary key,
  application_id bigint not null unique,
  data jsonb,
  submitted_at timestamptz,
  updated_at timestamptz default now() not null
);

create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  rl_key text not null,
  created_at timestamptz default now() not null
);

create table if not exists public.reassignment_requests (
  id bigint generated always as identity primary key,
  visit_id bigint not null,
  original_staff_id bigint not null,
  reason text,
  requested_by text,
  status text default 'open' not null,
  resolved_staff_id bigint,
  resolution_log jsonb,
  created_at timestamptz default now() not null
);

create table if not exists public.references (
  id bigint generated always as identity primary key,
  application_id bigint not null,
  referee_name text not null,
  referee_email text not null,
  relationship text,
  is_most_recent_employer boolean default false,
  status text default 'requested' not null,
  response jsonb,
  token text not null,
  created_at timestamptz default now() not null
);

create table if not exists public.rota_weeks (
  id bigint generated always as identity primary key,
  week_start_date date not null unique,
  status text default 'draft' not null,
  published_at timestamptz,
  published_by text,
  created_at timestamptz default now() not null
);

create table if not exists public.sla_policies (
  id bigint generated always as identity primary key,
  name text not null,
  category text,
  priority text not null,
  first_response_minutes integer not null,
  resolution_minutes integer not null
);

create table if not exists public.staff_availability (
  id bigint generated always as identity primary key,
  staff_id bigint not null,
  day_of_week integer not null,
  start_time text not null,
  end_time text not null
);

create table if not exists public.staff_profiles (
  id bigint generated always as identity primary key,
  user_id bigint,
  full_name text not null,
  email text,
  phone text,
  role text default 'care_worker' not null,
  employee_no text,
  job_title text,
  start_date date,
  employment_type text default 'full_time',
  contracted_hours numeric default '37.5',
  max_weekly_hours numeric default '48',
  home_postcode text,
  lat numeric,
  lng numeric,
  drives boolean default false,
  has_vehicle boolean default false,
  gender text,
  languages jsonb,
  skills jsonb,
  wtd_opt_out boolean default false,
  status text default 'active' not null,
  avatar_color text,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.staff_unavailability (
  id bigint generated always as identity primary key,
  staff_id bigint not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  notes text,
  status text default 'pending' not null,
  approved_by text,
  created_at timestamptz default now() not null
);

create table if not exists public.supervisor_notes (
  id bigint generated always as identity primary key,
  staff_id bigint not null,
  supervisor_id bigint,
  supervisor_name text,
  client_id bigint,
  visit_id bigint,
  note_type text not null,
  method text default 'typed' not null,
  transcript text,
  structured jsonb,
  rating integer,
  strengths text,
  improvements text,
  actions jsonb,
  visible_to_staff boolean default false,
  created_at timestamptz default now() not null
);

create table if not exists public.tasks (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  due_at timestamptz,
  assignee_id bigint,
  assignee_name text,
  created_by_name text,
  related_type text default 'none',
  related_id bigint,
  status text default 'open' not null,
  priority text default 'normal' not null,
  created_at timestamptz default now() not null
);

create table if not exists public.teams (
  id bigint generated always as identity primary key,
  name text not null,
  lead_id bigint,
  member_ids jsonb
);

create table if not exists public.ticket_comments (
  id bigint generated always as identity primary key,
  ticket_id bigint not null,
  author_id bigint,
  author_name text not null,
  body text not null,
  visibility text default 'internal' not null,
  mentions jsonb,
  created_at timestamptz default now() not null
);

create table if not exists public.ticket_events (
  id bigint generated always as identity primary key,
  ticket_id bigint not null,
  actor_name text,
  event text not null,
  from_value text,
  to_value text,
  at timestamptz default now() not null
);

create table if not exists public.tickets (
  id bigint generated always as identity primary key,
  ticket_no text not null unique,
  subject text not null,
  description text,
  category text default 'general' not null,
  priority text default 'normal' not null,
  status text default 'new' not null,
  channel text default 'internal' not null,
  requester_contact_id bigint,
  client_id bigint,
  staff_id bigint,
  assignee_id bigint,
  team_id bigint,
  escalation_level integer default 0,
  due_at timestamptz,
  first_response_due_at timestamptz,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_summary text,
  resolution_code text,
  satisfaction_score integer,
  is_formal_complaint boolean default false,
  merged_into_ticket_id bigint,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.ticket_watchers (
  id bigint generated always as identity primary key,
  ticket_id bigint not null,
  staff_id bigint not null,
  reason text not null
);

create table if not exists public.training_courses (
  id bigint generated always as identity primary key,
  title text not null,
  type text default 'online' not null,
  provider text,
  duration_hours numeric,
  mandatory boolean default true,
  renew_every_months integer
);

create table if not exists public.training_enrolments (
  id bigint generated always as identity primary key,
  session_id bigint,
  course_id bigint not null,
  person_type text not null,
  person_id bigint not null,
  status text default 'invited' not null,
  completed_at timestamptz,
  expires_at date,
  created_at timestamptz default now() not null
);

create table if not exists public.training_sessions (
  id bigint generated always as identity primary key,
  course_id bigint not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  capacity integer default 12,
  trainer_name text
);

create table if not exists public.travel_cache (
  id bigint generated always as identity primary key,
  from_postcode text not null,
  to_postcode text not null,
  minutes integer not null,
  km numeric,
  source text default 'haversine',
  fetched_at timestamptz default now() not null
);

create table if not exists public.users (
  id bigint generated always as identity primary key,
  union_id text not null unique,
  name text,
  email text,
  avatar text,
  role text default 'user' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  last_sign_in_at timestamptz default now() not null
);

create table if not exists public.visit_assignments (
  id bigint generated always as identity primary key,
  visit_id bigint not null,
  staff_id bigint not null,
  slot text default 'lead' not null,
  assigned_by text default 'system' not null,
  assignment_reason text,
  travel_minutes_from_previous integer,
  status text default 'assigned' not null,
  created_at timestamptz default now() not null
);

create table if not exists public.visits (
  id bigint generated always as identity primary key,
  rota_week_id bigint not null,
  client_id bigint not null,
  visit_template_id bigint,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  call_type text default 'single' not null,
  visit_type text,
  status text default 'unassigned' not null,
  notes text,
  external_ref text,
  created_at timestamptz default now() not null
);

create table if not exists public.visit_templates (
  id bigint generated always as identity primary key,
  care_package_id bigint not null,
  client_id bigint not null,
  day_of_week integer not null,
  start_time text not null,
  duration_minutes integer not null,
  call_type text default 'single' not null,
  visit_type text not null,
  tasks jsonb,
  flexibility_minutes integer default 15
);

-- Deny the anon and authenticated roles. The server uses the service role.
alter table public.ai_runs enable row level security;
alter table public.application_forms enable row level security;
alter table public.application_form_templates enable row level security;
alter table public.application_form_versions enable row level security;
alter table public.applications enable row level security;
alter table public.appraisals enable row level security;
alter table public.audit_log enable row level security;
alter table public.automation_rules enable row level security;
alter table public.candidates enable row level security;
alter table public.care_packages enable row level security;
alter table public.care_plans enable row level security;
alter table public.client_assigned_workers enable row level security;
alter table public.client_change_events enable row level security;
alter table public.client_preferences enable row level security;
alter table public.client_required_skills enable row level security;
alter table public.clients enable row level security;
alter table public.compliance_documents enable row level security;
alter table public.compliance_requirements enable row level security;
alter table public.crm_contact_relationships enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_organisations enable row level security;
alter table public.cv_versions enable row level security;
alter table public.dbs_verifications enable row level security;
alter table public.document_templates enable row level security;
alter table public.email_outbox enable row level security;
alter table public.incidents enable row level security;
alter table public.interactions enable row level security;
alter table public.interview_bookings enable row level security;
alter table public.interview_scorecards enable row level security;
alter table public.interview_slots enable row level security;
alter table public.job_link_sources enable row level security;
alter table public.job_postings enable row level security;
alter table public.mentions enable row level security;
alter table public.notifications enable row level security;
alter table public.offer_letters enable row level security;
alter table public.organisations enable row level security;
alter table public.plan_reviews enable row level security;
alter table public.pre_interview_forms enable row level security;
alter table public.rate_limit_events enable row level security;
alter table public.reassignment_requests enable row level security;
alter table public.references enable row level security;
alter table public.rota_weeks enable row level security;
alter table public.sla_policies enable row level security;
alter table public.staff_availability enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.staff_unavailability enable row level security;
alter table public.supervisor_notes enable row level security;
alter table public.tasks enable row level security;
alter table public.teams enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_events enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_watchers enable row level security;
alter table public.training_courses enable row level security;
alter table public.training_enrolments enable row level security;
alter table public.training_sessions enable row level security;
alter table public.travel_cache enable row level security;
alter table public.users enable row level security;
alter table public.visit_assignments enable row level security;
alter table public.visits enable row level security;
alter table public.visit_templates enable row level security;
