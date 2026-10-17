-- Interview booking integrity: one active booking per application; no duplicate slot/app pair.
-- Safe / idempotent. Run in the Supabase SQL editor.

-- Only one "booked" row per candidate application (prevents double-book from parallel clicks).
create unique index if not exists interview_bookings_one_active_per_app
  on public.interview_bookings (application_id)
  where status = 'booked';

-- Same candidate cannot hold the same slot twice while booked.
create unique index if not exists interview_bookings_slot_app_active
  on public.interview_bookings (slot_id, application_id)
  where status = 'booked';

create index if not exists interview_bookings_slot_booked_idx
  on public.interview_bookings (slot_id)
  where status = 'booked';
