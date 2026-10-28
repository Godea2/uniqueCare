-- Website marketing admin panel. New website_* tables only — never alters portal tables.
-- Extends existing website_enquiries / website_reviews for admin workflows.

-- ── Existing tables: status + reviewed_at helpers ───────────────────────────
alter table public.website_reviews
  add column if not exists reviewed_at timestamptz;

update public.website_reviews
   set reviewed_at = coalesce(reviewed_at, approved_at)
 where status in ('approved', 'rejected')
   and reviewed_at is null;

-- ── Admin users ─────────────────────────────────────────────────────────────
create table if not exists public.website_admin_users (
  id bigint generated always as identity primary key,
  email text not null unique,
  password_hash text not null,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Audit log ───────────────────────────────────────────────────────────────
create table if not exists public.website_audit_log (
  id bigint generated always as identity primary key,
  action text not null,
  entity_type text not null,
  entity_id text,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists website_audit_log_created_idx
  on public.website_audit_log (created_at desc);

-- ── Job applications (website form; portal Apply stays on portal) ───────────
create table if not exists public.website_applications (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  phone text,
  job_slug text not null,
  cover_letter text not null default '',
  right_to_work boolean not null default false,
  driving_licence boolean not null default false,
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'shortlisted', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists website_applications_status_idx
  on public.website_applications (status, created_at desc);

-- ── Newsletter subscribers ──────────────────────────────────────────────────
create table if not exists public.website_subscribers (
  id bigint generated always as identity primary key,
  email text not null unique,
  status text not null default 'active'
    check (status in ('active', 'unsubscribed')),
  created_at timestamptz not null default now()
);

-- ── Newsletters ─────────────────────────────────────────────────────────────
create table if not exists public.website_newsletters (
  id bigint generated always as identity primary key,
  subject text not null default '',
  content text not null default '',
  recipients_count integer,
  status text not null default 'draft'
    check (status in ('draft', 'sent')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Blog posts (CMS; public blog falls back to static content if empty) ─────
create table if not exists public.website_posts (
  id bigint generated always as identity primary key,
  title text not null,
  slug text not null unique,
  category text not null
    check (category in ('Care Advice', 'Company News', 'Health Tips', 'Industry Updates')),
  image_url text,
  excerpt text not null default '',
  content text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_posts_status_idx
  on public.website_posts (status, created_at desc);

-- ── SEO backlinks (off-page) ────────────────────────────────────────────────
create table if not exists public.website_backlinks (
  id bigint generated always as identity primary key,
  domain text not null,
  url text,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'acquired')),
  created_at timestamptz not null default now()
);

-- ── RLS: service role bypasses; lock down anon ──────────────────────────────
alter table public.website_admin_users enable row level security;
alter table public.website_audit_log enable row level security;
alter table public.website_applications enable row level security;
alter table public.website_subscribers enable row level security;
alter table public.website_newsletters enable row level security;
alter table public.website_posts enable row level security;
alter table public.website_backlinks enable row level security;

-- Public may insert applications + subscribe; read published posts only.
drop policy if exists "anon insert applications" on public.website_applications;
create policy "anon insert applications"
  on public.website_applications for insert to anon, authenticated
  with check (status = 'new');

drop policy if exists "anon insert subscribers" on public.website_subscribers;
create policy "anon insert subscribers"
  on public.website_subscribers for insert to anon, authenticated
  with check (status = 'active');

drop policy if exists "anon read published posts" on public.website_posts;
create policy "anon read published posts"
  on public.website_posts for select to anon, authenticated
  using (status = 'published');

grant insert on public.website_applications to anon, authenticated;
grant insert on public.website_subscribers to anon, authenticated;
grant select on public.website_posts to anon, authenticated;

-- Sequences for identity columns (PostgREST inserts from anon)
grant usage, select on all sequences in schema public to anon, authenticated;
