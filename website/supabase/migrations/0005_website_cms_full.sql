-- Full website CMS: branches, media library, navigation, certifications,
-- area imagery, theme seed, and complete page-section coverage.
-- Idempotent. Safe to re-run. Does not alter form/inbox tables.

-- ── Branches / offices (first-class; add/remove freely) ─────────────────────
create table if not exists public.website_branches (
  id bigint generated always as identity primary key,
  name text not null,
  address text not null default '',
  city text not null default '',
  postcode text not null default '',
  phone text not null default '',
  phone_display text not null default '',
  email text not null default '',
  hours text not null default '',
  maps_url text not null default '',
  image text not null default '',
  image_alt text not null default '',
  sort_order integer not null default 0,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_branches_status_sort_idx
  on public.website_branches (status, sort_order, name);

alter table public.website_branches enable row level security;

drop policy if exists "anon_select_published_branches" on public.website_branches;
create policy "anon_select_published_branches"
  on public.website_branches for select to anon, authenticated
  using (status = 'published');

-- ── Media library (public CDN URLs from storage or external) ────────────────
create table if not exists public.website_media_assets (
  id bigint generated always as identity primary key,
  kind text not null default 'image'
    check (kind in ('image', 'video', 'document', 'other')),
  url text not null,
  storage_key text,
  file_name text not null default '',
  alt text not null default '',
  folder text not null default 'general',
  width integer,
  height integer,
  bytes integer,
  mime_type text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists website_media_folder_idx
  on public.website_media_assets (folder, created_at desc);

alter table public.website_media_assets enable row level security;

drop policy if exists "anon_select_media" on public.website_media_assets;
create policy "anon_select_media"
  on public.website_media_assets for select to anon, authenticated
  using (true);

-- ── Navigation menus ────────────────────────────────────────────────────────
create table if not exists public.website_nav_items (
  id bigint generated always as identity primary key,
  menu text not null
    check (menu in ('header', 'footer_company', 'footer_legal', 'mobile_cta')),
  label text not null,
  href text not null,
  dropdown text not null default ''
    check (dropdown in ('', 'services', 'areas')),
  sort_order integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_nav_menu_sort_idx
  on public.website_nav_items (menu, sort_order);

alter table public.website_nav_items enable row level security;

drop policy if exists "anon_select_visible_nav" on public.website_nav_items;
create policy "anon_select_visible_nav"
  on public.website_nav_items for select to anon, authenticated
  using (visible = true);

-- ── Certifications / badges ─────────────────────────────────────────────────
create table if not exists public.website_certifications (
  id bigint generated always as identity primary key,
  code text not null,
  label text not null default '',
  image text not null default '',
  image_alt text not null default '',
  url text not null default '',
  sort_order integer not null default 0,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_certs_status_sort_idx
  on public.website_certifications (status, sort_order);

alter table public.website_certifications enable row level security;

drop policy if exists "anon_select_published_certs" on public.website_certifications;
create policy "anon_select_published_certs"
  on public.website_certifications for select to anon, authenticated
  using (status = 'published');

-- ── Areas: optional hero / card image ───────────────────────────────────────
alter table public.website_areas
  add column if not exists image text not null default '',
  add column if not exists image_alt text not null default '';

-- ── Seed branches from existing offices (idempotent by name) ────────────────
insert into public.website_branches (name, address, city, postcode, sort_order, status)
select v.name, v.address, v.city, v.postcode, v.sort_order, 'published'
from (values
  ('London Branch', '280 Mare Street, Hackney, London E8 1HE', 'London', 'E8 1HE', 10),
  ('Hertfordshire Branch', 'Suite 3, Phoenix House, 63 Campfield Rd, St Albans AL1 5FL', 'St Albans', 'AL1 5FL', 20)
) as v(name, address, city, postcode, sort_order)
where not exists (
  select 1 from public.website_branches b where b.name = v.name
);

-- ── Seed navigation ─────────────────────────────────────────────────────────
insert into public.website_nav_items (menu, label, href, dropdown, sort_order, visible)
select v.menu, v.label, v.href, v.dropdown, v.sort_order, true
from (values
  ('header', 'Home', '/', '', 10),
  ('header', 'About', '/about', '', 20),
  ('header', 'Services', '/services', 'services', 30),
  ('header', 'Areas We Serve', '/areas', 'areas', 40),
  ('header', 'Careers', '/careers', '', 50),
  ('header', 'Blog', '/blog', '', 60),
  ('header', 'Reviews', '/reviews', '', 70),
  ('footer_company', 'About us', '/about', '', 10),
  ('footer_company', 'Careers', '/careers', '', 20),
  ('footer_company', 'Blog', '/blog', '', 30),
  ('footer_company', 'Reviews', '/reviews', '', 40),
  ('footer_company', 'Contact', '/contact', '', 50),
  ('footer_legal', 'Privacy policy', '/privacy', '', 10),
  ('footer_legal', 'Terms of use', '/terms', '', 20),
  ('footer_legal', 'Modern slavery', '/modern-slavery', '', 30),
  ('footer_legal', 'Carbon reduction', '/carbon-reduction-plan', '', 40),
  ('mobile_cta', 'Call us', 'tel:+442039170260', '', 10),
  ('mobile_cta', 'Book now', '/contact', '', 20)
) as v(menu, label, href, dropdown, sort_order)
where not exists (
  select 1 from public.website_nav_items n
  where n.menu = v.menu and n.label = v.label and n.href = v.href
);

-- ── Seed certifications ─────────────────────────────────────────────────────
insert into public.website_certifications (code, label, image, image_alt, sort_order, status)
select v.code, v.label, v.image, v.image_alt, v.sort_order, 'published'
from (values
  ('ISO 9001:2015', 'Quality Management', '/images/iso9001.jpeg', 'ISO 9001:2015 - Quality Management', 10),
  ('ISO 45001:2018', 'Occupational Health & Safety', '/images/iso45001.jpeg', 'ISO 45001:2018 - Occupational Health & Safety', 20),
  ('ISO 14001:2015', 'Environmental Management', '/images/iso14001.jpeg', 'ISO 14001:2015 - Environmental Management', 30),
  ('ISO 27001:2022', 'Information Security Management', '/images/iso27001.jpeg', 'ISO 27001:2022 - Information Security Management', 40)
) as v(code, label, image, image_alt, sort_order)
where not exists (
  select 1 from public.website_certifications c where c.code = v.code
);

-- ── Merge theme + brand assets into site settings (preserve existing keys) ──
update public.website_site_settings
set payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
  'theme', coalesce(payload->'theme', '{
    "brandPrimary": "#124b99",
    "brandPrimaryDark": "#0c3875",
    "brandSecondary": "#0089ca",
    "brandSoft": "#eaf5fb",
    "brandInk": "#0a2540",
    "brandGold": "#d9a441",
    "ink": "#1a1f24",
    "inkMuted": "#5b6670",
    "surface": "#ffffff",
    "surfaceAlt": "#f7f8f7",
    "border": "#e3e7e6",
    "cqcGood": "#2e7d32"
  }'::jsonb),
  'brand', coalesce(payload->'brand', '{
    "logoUrl": "/images/logo-horizontal.png",
    "logoMarkUrl": "/images/logo-mark.png",
    "faviconUrl": "/favicon.ico",
    "ogImageUrl": "/images/og-image.png",
    "appleTouchIconUrl": "/apple-touch-icon.png"
  }'::jsonb),
  'seo', coalesce(payload->'seo', '{
    "defaultTitle": "Unique Care UK | Home Care in London & Hertfordshire",
    "titleTemplate": "%s",
    "defaultDescription": "Professional domiciliary, live-in care, and supported living across London and Hertfordshire. Compassionate, personalised home care.",
    "keywords": ["home care","domiciliary care","live-in care","supported living","London","Hertfordshire"]
  }'::jsonb),
  'ctaBand', coalesce(payload->'ctaBand', '{
    "title": "Ready to talk about care?",
    "text": "Book a free, no-obligation assessment. We are here seven days a week.",
    "primaryCta": {"label": "Book a free assessment", "href": "/contact"},
    "secondaryCta": {"label": "Call us", "href": "tel:+442039170260"},
    "image": "/images/live-in-care.jpg"
  }'::jsonb),
  'whatsapp', coalesce(payload->'whatsapp', to_jsonb('https://wa.me/447958367038'::text)),
  'whatsappEnabled', coalesce(payload->'whatsappEnabled', 'true'::jsonb)
),
updated_at = now()
where id = 'default';

-- ── Additional / richer page sections ───────────────────────────────────────
insert into public.website_page_sections (page_key, section_key, label, content, sort_order, status)
values
(
  'home', 'services_intro', 'Home — services intro',
  '{"eyebrow":"What we offer","title":"Eight specialist care services","subtitle":"From a few hours a week to round-the-clock support — always person-centred."}'::jsonb,
  30, 'published'
),
(
  'home', 'certs_intro', 'Home — certifications intro',
  '{"eyebrow":"Independently verified","title":"Certified for quality and safety","subtitle":"Our ISO certifications prove that every process meets rigorous international standards."}'::jsonb,
  40, 'published'
),
(
  'home', 'testimonials_intro', 'Home — testimonials intro',
  '{"eyebrow":"Families trust us","title":"What families say","subtitle":"Real reviews from people we support."}'::jsonb,
  50, 'published'
),
(
  'home', 'areas_intro', 'Home — areas intro',
  '{"eyebrow":"Where we work","title":"Areas we serve","subtitle":"Local teams across London, Essex, and Hertfordshire."}'::jsonb,
  60, 'published'
),
(
  'home', 'closing_cta', 'Home — closing CTA',
  '{"title":"Let us support your family","text":"Speak to our care team today about a free assessment.","primaryCta":{"label":"Get in touch","href":"/contact"},"secondaryCta":{"label":"View services","href":"/services"},"image":"/images/live-in-care.jpg"}'::jsonb,
  70, 'published'
),
(
  'home', 'why_side', 'Home — why-us side image',
  '{"image":"/images/why-choose-us.jpg","imageAlt":"Care worker supporting a client at home","overlayTitle":"Care you can trust","overlayText":"CQC Good · ISO certified"}'::jsonb,
  25, 'published'
),
(
  'about', 'hero', 'About hero',
  '{"eyebrow":"Est. 2017","title":"About Unique Care UK","subtitle":"Dedicated to providing exceptional care in the comfort of your own home, across London, Essex, and Hertfordshire.","videoSrc":"/videos/care-at-home.mp4","poster":"/images/about-hero.jpg"}'::jsonb,
  10, 'published'
),
(
  'about', 'who_we_are', 'About — who we are',
  '{"title":"Who we are","paragraphs":["Unique Care UK is a division of Unique Resourcing Ltd. We offer bespoke specialist care solutions tailored to the individual needs of each service user.","Our experienced team delivers domiciliary care, live-in care, and supported living with compassion, professionalism, and respect — helping people live independently and with dignity in their own homes."]}'::jsonb,
  20, 'published'
),
(
  'about', 'who_we_support', 'About — who we support',
  '{"eyebrow":"Who we support","title":"Care tailored to real lives","items":[{"label":"People living with long-term illnesses","thumb":"/images/cards/support-longterm.jpg"},{"label":"Elderly people with dementia and Alzheimer''s","thumb":"/images/cards/support-dementia.jpg"},{"label":"Young and old with learning disabilities","thumb":"/images/cards/support-learning.jpg"},{"label":"Those with mental health needs","thumb":"/images/cards/support-mentalhealth.jpg"},{"label":"People living with addiction","thumb":"/images/cards/support-addiction.jpg"},{"label":"Individuals recovering from illness or injury","thumb":"/images/cards/support-recovery.jpg"}]}'::jsonb,
  30, 'published'
),
(
  'about', 'drivers', 'About — what drives us',
  '{"eyebrow":"What drives us","title":"Mission, quality, people, values","items":[{"title":"Our Mission","text":"To provide compassionate, person-centred care that empowers individuals to live independently and with dignity in their own homes.","icon":"Heart","thumb":"/images/cards/drives-mission.jpg"},{"title":"Quality Assured","text":"We hold ISO 9001 and ISO 45001 certifications, demonstrating our commitment to quality management and occupational health & safety.","icon":"Award","thumb":"/images/cards/drives-quality.jpg"},{"title":"Our Team","text":"Our care workers are carefully recruited, professionally trained, and share our passion for delivering outstanding care to every client.","icon":"Users","thumb":"/images/cards/drives-team.jpg"},{"title":"Our Values","text":"Compassion, respect, reliability, and excellence guide everything we do. We treat every service user as we would treat our own family.","icon":"Sparkles","thumb":"/images/cards/drives-values.jpg"}]}'::jsonb,
  40, 'published'
),
(
  'about', 'cta', 'About — CTA',
  '{"title":"Ready to learn more?","text":"Speak with our friendly team about how we can support you or your loved one.","primaryCta":{"label":"Contact us","href":"/contact"},"secondaryCta":{"label":"Our services","href":"/services"}}'::jsonb,
  50, 'published'
),
(
  'careers', 'hero', 'Careers hero',
  '{"eyebrow":"We''re Hiring","title":"Join our team","subtitle":"Are you a compassionate individual with a genuine desire to improve the lives of others? We''d love to hear from you.","primaryCta":{"label":"View Open Positions","href":"/careers/jobs"},"poster":"/images/careers-hero.jpg","videoSrc":"/videos/hero-home-care.mp4"}'::jsonb,
  10, 'published'
),
(
  'contact', 'hero', 'Contact hero',
  '{"eyebrow":"Get in touch","title":"Contact Unique Care UK","subtitle":"Book a free assessment or ask us anything. We respond quickly during office hours."}'::jsonb,
  10, 'published'
),
(
  'contact', 'form_intro', 'Contact — form intro',
  '{"title":"Send us a message","text":"Tell us a little about the care you need and we will get back to you."}'::jsonb,
  20, 'published'
),
(
  'services', 'hero', 'Services index hero',
  '{"eyebrow":"Our services","title":"Care services","subtitle":"Specialist domiciliary, live-in, and supported living options tailored to each person."}'::jsonb,
  10, 'published'
),
(
  'areas', 'hero', 'Areas index hero',
  '{"eyebrow":"Coverage","title":"Areas we serve","subtitle":"Local care teams across London, Essex, and Hertfordshire."}'::jsonb,
  10, 'published'
),
(
  'reviews', 'hero', 'Reviews hero',
  '{"eyebrow":"Testimonials","title":"What families say","subtitle":"Honest feedback from the people we support."}'::jsonb,
  10, 'published'
),
(
  'blog', 'hero', 'Blog hero',
  '{"eyebrow":"Insights","title":"Care advice & news","subtitle":"Practical guidance and updates from our team."}'::jsonb,
  10, 'published'
)
on conflict (page_key, section_key) do update
set
  label = excluded.label,
  content = case
    when website_page_sections.content = '{}'::jsonb then excluded.content
    else website_page_sections.content
  end,
  sort_order = excluded.sort_order,
  updated_at = now();
