-- UniqueCare Connect: tidy applications created before "one live application per person per job".
-- Safe to run more than once. Run it in the Supabase SQL editor.

-- 1. Where a person has more than one open application for the same job, keep the newest
--    and withdraw the older ones, noting why in their stage history.
with ranked as (
  select id,
         row_number() over (partition by candidate_id, job_posting_id order by created_at desc, id desc) as rn,
         first_value(id) over (partition by candidate_id, job_posting_id order by created_at desc, id desc) as newest_id
  from public.applications
  where stage not in ('hired', 'rejected', 'withdrawn', 'screened_out')
)
update public.applications a
set stage = 'withdrawn',
    updated_at = now(),
    stage_history = coalesce(a.stage_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'from', a.stage,
      'to', 'withdrawn',
      'actor', 'System (duplicate check)',
      'reason', 'Replaced by a newer application (#' || r.newest_id || ') for the same job',
      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ))
from ranked r
where a.id = r.id and r.rn > 1;

-- 2. Closed applications don't hold interview times.
update public.interview_bookings b
set status = 'cancelled'
from public.applications a
where b.application_id = a.id
  and b.status = 'booked'
  and a.stage in ('rejected', 'withdrawn', 'screened_out');

-- 3. "Interview booked" without a booked time goes back to waiting to book.
update public.applications a
set stage = 'pre_interview_forms_complete',
    updated_at = now(),
    stage_history = coalesce(a.stage_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'from', 'interview_booked',
      'to', 'pre_interview_forms_complete',
      'actor', 'System (clean-up)',
      'reason', 'No interview time was booked',
      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ))
where a.stage = 'interview_booked'
  and not exists (
    select 1 from public.interview_bookings b where b.application_id = a.id and b.status = 'booked'
  );
