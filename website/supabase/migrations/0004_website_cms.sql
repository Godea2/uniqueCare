-- Website CMS: site settings, services, areas, page sections.
-- Service-role (portal) manages all writes. Anon may SELECT published/active only.
-- Does not alter enquiry/review/application/subscriber form tables or policies.

-- ── Site settings (single-row keyed document) ───────────────────────────────
create table if not exists public.website_site_settings (
  id text primary key default 'default',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.website_site_settings enable row level security;

drop policy if exists "anon_select_site_settings" on public.website_site_settings;
create policy "anon_select_site_settings"
  on public.website_site_settings for select to anon, authenticated
  using (true);

-- ── Services collection ─────────────────────────────────────────────────────
create table if not exists public.website_services (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  short text not null default '',
  image text not null default '',
  image_alt text not null default '',
  icon text not null default 'home',
  badge text,
  body jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_services_status_sort_idx
  on public.website_services (status, sort_order, name);

alter table public.website_services enable row level security;

drop policy if exists "anon_select_published_services" on public.website_services;
create policy "anon_select_published_services"
  on public.website_services for select to anon, authenticated
  using (status = 'published');

-- ── Areas collection ────────────────────────────────────────────────────────
create table if not exists public.website_areas (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  region text not null default '',
  intro text not null default '',
  surrounding text not null default '',
  sort_order integer not null default 0,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_areas_status_sort_idx
  on public.website_areas (status, sort_order, name);

alter table public.website_areas enable row level security;

drop policy if exists "anon_select_published_areas" on public.website_areas;
create policy "anon_select_published_areas"
  on public.website_areas for select to anon, authenticated
  using (status = 'published');

-- ── Page sections (keyed JSON blobs — layout stays in code) ─────────────────
create table if not exists public.website_page_sections (
  id bigint generated always as identity primary key,
  page_key text not null,
  section_key text not null,
  label text not null default '',
  content jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  updated_at timestamptz not null default now(),
  unique (page_key, section_key)
);

create index if not exists website_page_sections_page_idx
  on public.website_page_sections (page_key, sort_order);

alter table public.website_page_sections enable row level security;

drop policy if exists "anon_select_published_sections" on public.website_page_sections;
create policy "anon_select_published_sections"
  on public.website_page_sections for select to anon, authenticated
  using (status = 'published');

-- ── Seed site settings (idempotent) ─────────────────────────────────────────
insert into public.website_site_settings (id, payload)
values (
  'default',
  '{
    "name": "Unique Care UK",
    "legalName": "Unique Resourcing Ltd",
    "vat": "285 7129 71",
    "founded": 2017,
    "url": "https://uniquecareuk.com",
    "phonePrimary": "02039170260",
    "phonePrimaryDisplay": "020 3917 0260",
    "phonePrimaryTel": "tel:+442039170260",
    "phoneMobile": "07958367038",
    "phoneMobileDisplay": "07958 367038",
    "phoneMobileTel": "tel:+447958367038",
    "whatsapp": "https://wa.me/447958367038",
    "email": "info@uniquecareuk.com",
    "hours": "Mon–Fri: 9am–5pm | Sat–Sun: 24-hour services",
    "offices": [
      {"name": "London Branch", "address": "280 Mare Street, Hackney, London E8 1HE"},
      {"name": "Hertfordshire Branch", "address": "Suite 3, Phoenix House, 63 Campfield Rd, St Albans AL1 5FL"}
    ],
    "footerLocation": "London & Essex",
    "footerBlurb": "ISO 9001 & ISO 45001 certified home care provider. Compassionate, personalised care across London, Essex, and Hertfordshire since 2017.",
    "cqcReportUrl": "https://www.cqc.org.uk/location/1-6980495983?referer=widget3",
    "cqcRating": "Good",
    "social": {
      "facebook": "https://www.facebook.com/profile.php?id=100070078392760",
      "instagram": "https://www.instagram.com/unique_care_united_kingdom",
      "linkedin": "https://www.linkedin.com/company/uniqueresourcinglimited/about/"
    },
    "areas": ["London", "Essex", "Hertfordshire"]
  }'::jsonb
)
on conflict (id) do nothing;

-- ── Seed areas ──────────────────────────────────────────────────────────────
insert into public.website_areas (slug, name, region, intro, surrounding, sort_order, status)
values
  ('london', 'London', 'Greater London',
   'Professional home care services across London boroughs. Domiciliary care, live-in care, and supported living throughout the capital.',
   'London and the surrounding Greater London area', 10, 'published'),
  ('essex', 'Essex', 'Essex',
   'Home care services across Essex including Barking, Dagenham, Romford, Ilford, and surrounding areas.',
   'Essex and the surrounding Essex area', 20, 'published'),
  ('hertfordshire', 'Hertfordshire', 'Hertfordshire',
   'Domiciliary care, live-in care, and supported living services across Hertfordshire including Hertford, Ware, Hoddesdon, and surrounding areas.',
   'Hertfordshire and the surrounding Hertfordshire area', 30, 'published')
on conflict (slug) do nothing;

-- ── Seed page sections (editable marketing blocks) ──────────────────────────
insert into public.website_page_sections (page_key, section_key, label, content, sort_order, status)
values
(
  'home', 'hero', 'Home hero',
  '{
    "eyebrow": "ISO certified care provider",
    "title": "Exceptional care in the comfort of your home",
    "subtitle": "Care that meets the standard. Compassion that exceeds it.",
    "text": "Trusted CQC-rated home care provider, ISO 9001 & 45001 certified for quality and safety.",
    "primaryCta": {"label": "Book a free assessment", "href": "/contact"},
    "secondaryCta": {"label": "Call us", "href": "tel:+442039170260"},
    "videoSrc": "/videos/hero-home-care.mp4",
    "poster": "/images/hero-caregiver.jpg",
    "videos": ["/videos/hero-home-care.mp4","/videos/personal-care.mp4","/videos/companionship.mp4","/videos/complex-care.mp4","/videos/home-support.mp4"]
  }'::jsonb,
  10, 'published'
),
(
  'home', 'why_us', 'Home — why us cards',
  '{
    "eyebrow": "Why us",
    "title": "What makes us different",
    "subtitle": "In a market with 45+ providers, here''s why families choose us.",
    "items": [
      {"title": "Certified Quality", "text": "We don''t just claim quality. We prove it. Our ISO 9001 and ISO 45001 certifications mean every process, every visit, and every care plan meets independently verified standards.", "icon": "ShieldCheck", "thumb": "/images/cards/why-certified.jpg"},
      {"title": "Genuine Compassion", "text": "Our care workers are chosen for their warmth and empathy first. Skills can be taught; a caring heart cannot. We treat every service user as we would our own family.", "icon": "Heart", "thumb": "/images/cards/why-cqc.jpg"},
      {"title": "Local Roots", "text": "We live and work in the communities we serve across London, Essex, and Hertfordshire. We understand the unique needs of our neighbours.", "icon": "MapPin", "thumb": "/images/cards/why-local.jpg"},
      {"title": "Transparent Trust", "text": "We welcome scrutiny. Our CQC ''Good'' rating, our certifications, and our commitment to honest communication mean you always know exactly where you stand.", "icon": "Sparkles", "thumb": "/images/cards/why-environment.jpg"}
    ]
  }'::jsonb,
  20, 'published'
),
(
  'home', 'stats', 'Home stats strip',
  '{
    "items": [
      {"label": "CQC \"Good\"", "text": "Independently rated"},
      {"label": "ISO 9001", "text": "Quality certified"},
      {"label": "24/7", "text": "Support available"},
      {"label": "9+ years", "text": "Of trusted care"}
    ]
  }'::jsonb,
  15, 'published'
),
(
  'about', 'hero', 'About hero',
  '{
    "eyebrow": "About us",
    "title": "Care that puts people first",
    "subtitle": "Unique Care UK has been supporting families across London, Essex, and Hertfordshire since 2017."
  }'::jsonb,
  10, 'published'
),
(
  'careers', 'hero', 'Careers hero',
  '{
    "eyebrow": "We''re Hiring",
    "title": "Join our team",
    "subtitle": "Are you a compassionate individual with a genuine desire to improve the lives of others? We''d love to hear from you.",
    "primaryCta": {"label": "View Open Positions", "href": "/careers/jobs"}
  }'::jsonb,
  10, 'published'
),
(
  'careers', 'benefits', 'Careers benefits',
  '{
    "eyebrow": "Benefits",
    "title": "Why work with us?",
    "subtitle": "We strive to create a supportive and nurturing environment for both our service users and our staff.",
    "items": [
      {"title": "Mandatory Training for Staff", "text": "Comprehensive induction course and ongoing mandatory training provided to all staff members at no cost.", "icon": "GraduationCap", "thumb": "/images/cards/benefits-training.jpg"},
      {"title": "Good Rates of Pay", "text": "Competitive pay rates that reflect your skills and dedication. We value the work our carers do every day.", "icon": "Banknote", "thumb": "/images/cards/benefits-pay.jpg"},
      {"title": "Various Work Environments", "text": "Opportunities across both public and private healthcare sectors. Gain diverse experience and grow your career.", "icon": "HeartHandshake", "thumb": "/images/cards/benefits-environments.jpg"},
      {"title": "A Variety of Work Locations", "text": "Placements across London, Essex, and Hertfordshire. Work close to home or explore new areas. The choice is yours.", "icon": "MapPin", "thumb": "/images/cards/benefits-locations.jpg"},
      {"title": "Fast Track Applications", "text": "Our streamlined application process gets you into work quickly. Apply today and start making a difference sooner.", "icon": "Zap", "thumb": "/images/cards/benefits-fasttrack.jpg"},
      {"title": "Contact Available Around the Clock", "text": "24/7 on-call management support. Whether it''s day or night, our team is always there when you need us.", "icon": "PhoneCall", "thumb": "/images/cards/benefits-247.jpg"},
      {"title": "Flexible Working", "text": "Days, evenings, nights, weekends, and bank holidays. Choose a schedule that works around your life.", "icon": "Clock3", "thumb": "/images/cards/benefits-flexible.jpg"},
      {"title": "Paid Mileage & Motorbike Scheme", "text": "Mileage paid on every client visit, or ride one of our company motorbikes on your daily rounds. Your travel to clients is always covered.", "icon": "Bike", "thumb": "/images/cards/benefits-mileage.jpg"}
    ]
  }'::jsonb,
  20, 'published'
)
on conflict (page_key, section_key) do nothing;
