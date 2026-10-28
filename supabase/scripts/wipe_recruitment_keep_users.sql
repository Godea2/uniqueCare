-- DEV ONLY — wipe recruitment data, keep staff / users / org settings.
-- Run in Supabase SQL editor (portal project). Not for production.
--
-- Clears: job postings, application forms, pipeline (applications/candidates),
--         interviews, offers, candidate compliance uploads, related mail/AI noise.
-- Keeps:  staff_profiles, users, organisations, teams, document templates,
--         compliance_requirements catalog, training course catalog, CRM/clients/rota/CQC.

begin;

-- Candidate-owned compliance docs only (staff docs stay).
delete from public.compliance_documents
 where owner_type in ('candidate', 'application');

-- Candidate training enrolments only (staff enrolments stay).
delete from public.training_enrolments
 where person_type = 'candidate';

-- One TRUNCATE so FKs between these tables are handled together.
truncate table
  public.interview_scorecards,
  public.interview_bookings,
  public.interview_slots,
  public.pre_interview_forms,
  public."references",
  public.offer_letters,
  public.outgoing_documents,
  public.cv_versions,
  public.dbs_verifications,
  public.applications,
  public.candidates,
  public.application_form_versions,
  public.application_forms,
  public.application_form_templates,
  public.job_link_sources,
  public.job_postings,
  public.ai_runs,
  public.email_outbox,
  public.notifications,
  public.rate_limit_events
restart identity cascade;

-- Optional: clear audit noise from old recruitment activity (staff accounts untouched).
delete from public.audit_log
 where entity_type in (
   'application', 'applications', 'candidate', 'candidates',
   'job_posting', 'job_postings', 'application_form', 'application_forms',
   'interview_slot', 'interview_booking', 'offer_letter', 'outgoing_document',
   'compliance_document', 'reference', 'pre_interview_form'
 );

commit;

-- Sanity check (should show 0 for recruitment; staff/users still counted).
select 'job_postings' as t, count(*)::int as n from public.job_postings
union all select 'applications', count(*)::int from public.applications
union all select 'candidates', count(*)::int from public.candidates
union all select 'application_forms', count(*)::int from public.application_forms
union all select 'staff_profiles', count(*)::int from public.staff_profiles
union all select 'users', count(*)::int from public.users
order by 1;
