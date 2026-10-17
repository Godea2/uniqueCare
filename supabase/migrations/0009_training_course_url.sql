-- Course catalogue: learning URL for self-paced / online redirects.
-- Safe / idempotent. Run in the Supabase SQL editor.

alter table public.training_courses
  add column if not exists course_url text;

comment on column public.training_courses.course_url is
  'External learning link candidates open to take the course (e.g. LMS or provider URL).';
