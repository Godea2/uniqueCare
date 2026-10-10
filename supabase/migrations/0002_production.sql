-- UniqueCare Connect: production upgrade.
-- Safe to run more than once. Run it in the Supabase SQL editor BEFORE deploying the new build.

begin;

-- ── 1. New columns used by the app ─────────────────────────────────────────
alter table public.compliance_documents add column if not exists file_key text;
alter table public.staff_profiles      add column if not exists home_role text;

-- ── 2. Organisation profile (name, signatory on offer letters, AI shortlist threshold) ──
insert into public.organisations (name, settings)
select 'Unique Care UK',
       jsonb_build_object(
         'timezone', 'Europe/London',
         'screeningThreshold', 85,
         'signatoryName', 'Unique Care UK recruitment team',
         'signatoryTitle', ''
       )
where not exists (select 1 from public.organisations);

update public.organisations
set settings = jsonb_build_object('timezone', 'Europe/London', 'screeningThreshold', 85)
               || coalesce(settings, '{}'::jsonb),
    updated_at = now();

-- ── 3. Pre-employment compliance checklist (CQC Regulation 19, Schedule 3) ──
insert into public.compliance_requirements (key, label, applies_to, required, expires_after_months) values
  ('dbs_enhanced',       'Enhanced DBS with adult barred list',            'candidate', true, 36),
  ('right_to_work',      'Right to work check',                            'candidate', true, null),
  ('photo_id',           'Photo ID',                                       'candidate', true, null),
  ('proof_of_address',   'Proof of address (under 3 months old)',          'candidate', true, null),
  ('reference_1',        'Reference — most recent care employer',          'candidate', true, null),
  ('reference_2',        'Reference — second referee',                     'candidate', true, null),
  ('employment_history', 'Full employment history with gaps explained',    'candidate', true, null),
  ('qualifications',     'Qualifications / certificates',                  'candidate', true, null),
  ('health_declaration', 'Health declaration',                             'candidate', true, 12),
  ('signed_contract',    'Signed contract',                                'candidate', true, null),
  ('bank_details',       'Bank details for payroll',                       'candidate', true, null),
  ('driving_docs',       'Driving licence + business insurance (drivers)', 'candidate', true, 12)
on conflict (key) do nothing;

-- ── 4. Mandatory training catalogue ─────────────────────────────────────────
insert into public.training_courses (title, type, provider, duration_hours, mandatory, renew_every_months)
select v.title, v.type, 'Unique Care Academy', v.hours, true, v.renew
from (values
  ('Care Certificate — Standards 1–15 (theory)', 'online',    6.0, null::int),
  ('Safeguarding Adults Level 2',                'online',    3.0, 12),
  ('Moving & Handling (theory)',                 'online',    2.0, 12),
  ('Moving & Handling (practical)',              'classroom', 4.0, 12),
  ('Infection Prevention & Control',             'online',    2.0, 12),
  ('Basic Life Support (theory)',                'online',    2.0, 12),
  ('Medication Awareness & Administration',      'online',    3.0, 24),
  ('Fire Safety',                                'online',    1.5, 12),
  ('Food Hygiene Level 2',                       'online',    2.0, 36),
  ('Information Governance / GDPR',              'online',    1.5, 12),
  ('Mental Capacity Act & DoLS',                 'online',    2.0, 24),
  ('Dementia Awareness',                         'online',    2.0, 24),
  ('Equality, Diversity & Inclusion',            'online',    1.5, 24),
  ('Health & Safety at Work',                    'online',    2.0, 12)
) as v(title, type, hours, renew)
where not exists (select 1 from public.training_courses t where t.title = v.title);

-- ── 5. Document templates (care plans, support plans, supervision, appraisals) ──
insert into public.document_templates (kind, version, name, structure, active)
select v.kind, 1, v.name, v.structure::jsonb, true
from (values
  ('care_plan', 'Care plan (standard)', '[
    {"key":"about_me","title":"About me","required":true,"guidance":"Who I am, my story, what matters to me"},
    {"key":"important_people","title":"Important people in my life","required":true},
    {"key":"health_conditions","title":"My health conditions","required":true},
    {"key":"medication_support","title":"Medication support","required":true},
    {"key":"mobility","title":"Mobility and moving & handling","required":true},
    {"key":"personal_care","title":"Personal care","required":true},
    {"key":"nutrition","title":"Nutrition and hydration","required":true},
    {"key":"continence","title":"Continence","required":false},
    {"key":"skin","title":"Skin integrity","required":false},
    {"key":"communication","title":"Communication and sensory needs","required":true},
    {"key":"mental_health","title":"Mental health, cognition and capacity (MCA)","required":true},
    {"key":"social_needs","title":"Social, cultural and spiritual needs","required":false},
    {"key":"risks","title":"Risks and how we reduce them","required":true},
    {"key":"visit_schedule","title":"My visit schedule and tasks","required":true},
    {"key":"outcomes","title":"My outcomes and goals","required":true},
    {"key":"consent","title":"Consent","required":true},
    {"key":"review_date","title":"Review date","required":true}
  ]'),
  ('support_plan', 'Support plan (person-centred)', '[
    {"key":"outcomes","title":"Outcomes I want to achieve","required":true},
    {"key":"how_supported","title":"How I want to be supported","required":true},
    {"key":"working","title":"What''s working / not working","required":true},
    {"key":"independence","title":"Independence and daily living","required":true},
    {"key":"community","title":"Community and relationships","required":false},
    {"key":"positive_risk","title":"Risks I choose to take (positive risk-taking)","required":true},
    {"key":"contingency","title":"Contingency plans","required":true},
    {"key":"review","title":"Review","required":true}
  ]'),
  ('supervisor_note', 'Supervisor note (CQC key questions)', '[
    {"key":"staff_member","title":"Staff member","required":true},
    {"key":"date_type","title":"Date and type","required":true},
    {"key":"client_visit","title":"Client / visit (optional)","required":false},
    {"key":"safe","title":"Safe — observations","required":true},
    {"key":"effective","title":"Effective — observations","required":true},
    {"key":"caring","title":"Caring — observations","required":true},
    {"key":"responsive","title":"Responsive — observations","required":false},
    {"key":"well_led","title":"Well-led — observations","required":false},
    {"key":"strengths","title":"Strengths","required":true},
    {"key":"develop","title":"Areas to develop","required":true},
    {"key":"actions","title":"Agreed actions and due dates","required":true},
    {"key":"staff_comments","title":"Staff comments","required":false}
  ]'),
  ('offer_letter', 'Offer of employment', '[
    {"key":"role","title":"Role and start date"},
    {"key":"pay","title":"Pay and hours"},
    {"key":"terms","title":"Terms"}
  ]'),
  ('appraisal', 'Annual appraisal', '[
    {"key":"summary","title":"Summary of the year"},
    {"key":"strengths","title":"Strengths"},
    {"key":"development","title":"Development areas"},
    {"key":"objectives","title":"Objectives for next year"}
  ]')
) as v(kind, name, structure)
where not exists (select 1 from public.document_templates d where d.kind = v.kind and d.active);

-- ── 6. Helpdesk SLA policies ─────────────────────────────────────────────────
insert into public.sla_policies (name, priority, first_response_minutes, resolution_minutes)
select v.name, v.priority, v.first_response, v.resolution
from (values
  ('Urgent', 'urgent',   30,  120),
  ('High',   'high',     60,  480),
  ('Normal', 'normal',  240, 1440),
  ('Low',    'low',    1440, 4320)
) as v(name, priority, first_response, resolution)
where not exists (select 1 from public.sla_policies s where s.priority = v.priority and s.category is null);

-- ── 7. Automation switches shown in Settings ─────────────────────────────────
-- Only switches the server actually checks are listed; older demo rows did nothing.
delete from public.automation_rules where key not in ('application_submitted', 'ai_shortlist');
insert into public.automation_rules (key, label, description, enabled) values
  ('application_submitted', 'Screen new applications automatically',
   'As soon as a candidate applies, AI scores them against the job''s screening requirements.', true),
  ('ai_shortlist', 'Shortlist strong candidates automatically',
   'Candidates who meet every must-have and reach the job''s threshold are shortlisted and emailed their pre-interview form. When off, they go to Review for a person to decide.', true)
on conflict (key) do update set label = excluded.label, description = excluded.description;

-- ── 8. Private storage buckets (the app also creates these on first upload) ──
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false), ('documents', 'documents', false)
on conflict (id) do nothing;

-- ── 9. Indexes for the lookups the app does on every page ───────────────────
create index if not exists applications_job_idx          on public.applications (job_posting_id);
create index if not exists applications_candidate_idx    on public.applications (candidate_id);
create index if not exists applications_stage_idx        on public.applications (stage);
create index if not exists candidates_email_idx          on public.candidates (lower(email));
create index if not exists compliance_docs_owner_idx     on public.compliance_documents (owner_type, owner_id);
create index if not exists compliance_docs_status_idx    on public.compliance_documents (status);
create index if not exists notifications_staff_idx       on public.notifications (staff_id, created_at desc);
create index if not exists staff_profiles_user_idx       on public.staff_profiles (user_id);
create index if not exists staff_profiles_email_idx      on public.staff_profiles (lower(email));
create index if not exists rate_limit_lookup_idx         on public.rate_limit_events (bucket, rl_key, created_at);
create index if not exists application_forms_job_idx     on public.application_forms (job_posting_id);
create index if not exists form_versions_form_idx        on public.application_form_versions (form_id, version desc);
create index if not exists training_enrolments_person_idx on public.training_enrolments (person_type, person_id);
create index if not exists visits_start_idx              on public.visits (scheduled_start);
create index if not exists audit_log_at_idx              on public.audit_log (at desc);

commit;
