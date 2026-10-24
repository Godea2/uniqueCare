-- Unique Care UK public website — new tables only (website_ prefix).
-- This migration must never alter, rename or drop any existing table,
-- policy or function belonging to the application.

create table if not exists public.website_enquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  phone text,
  enquiry_type text not null default 'Care Enquiry',
  care_type text,
  message text not null,
  source_page text,
  ip_hash text,
  status text not null default 'new'
);

create table if not exists public.website_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  relationship text not null,
  rating integer not null check (rating between 1 and 5),
  title text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_at timestamptz,
  ip_hash text
);

alter table public.website_enquiries enable row level security;
alter table public.website_reviews enable row level security;

-- Anonymous visitors may INSERT only (form submissions).
drop policy if exists "anon insert enquiries" on public.website_enquiries;
create policy "anon insert enquiries"
  on public.website_enquiries for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anon insert reviews" on public.website_reviews;
create policy "anon insert reviews"
  on public.website_reviews for insert
  to anon, authenticated
  with check (status = 'pending');

-- Anonymous visitors may read APPROVED reviews only.
drop policy if exists "anon read approved reviews" on public.website_reviews;
create policy "anon read approved reviews"
  on public.website_reviews for select
  to anon, authenticated
  using (status = 'approved');

-- No anonymous UPDATE/DELETE — moderation happens via the server-only
-- service role behind the signed moderation-token endpoint.

grant insert on public.website_enquiries to anon, authenticated;
grant insert, select on public.website_reviews to anon, authenticated;

-- Seed review (the Emilio A testimonial) so the page is never empty at launch.
insert into public.website_reviews (name, relationship, rating, title, body, status, approved_at)
select
  'Emilio A',
  'Family Member',
  5,
  'Outstanding care',
  'Had two visits from one particular carer from Unique Care UK as my mother had to return to hospital. She is outstanding! Very caring, full of concern for my mothers well being and knows exactly how to handle all situations. Thank you to her.',
  'approved',
  now()
where not exists (select 1 from public.website_reviews);

-- Retention (matches the Privacy Policy): delete enquiries older than
-- 12 months. Run monthly via Supabase cron (pg_cron), e.g.:
--   select cron.schedule('website-retention', '0 3 1 * *', $job$
--     delete from public.website_enquiries
--     where created_at < now() - interval '12 months';
--   $job$);
