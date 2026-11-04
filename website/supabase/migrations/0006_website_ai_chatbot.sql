-- Website AI chatbot: settings, prompt versions, knowledge documents + chunks.
-- Portal (service role) manages writes. Anon may only read public bot config.
-- Enquiry status extended with "closed".

-- ── Soften enquiry statuses for admin workflow ──────────────────────────────
do $$
begin
  -- Drop old check if present, then re-add with closed.
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'website_enquiries' and constraint_name like '%status%'
  ) then
    alter table public.website_enquiries drop constraint if exists website_enquiries_status_check;
  end if;
exception when others then
  alter table public.website_enquiries drop constraint if exists website_enquiries_status_check;
end $$;

alter table public.website_enquiries drop constraint if exists website_enquiries_status_check;
alter table public.website_enquiries
  add constraint website_enquiries_status_check
  check (status in ('new', 'read', 'replied', 'closed'));

-- ── AI settings (single row) ────────────────────────────────────────────────
create table if not exists public.website_ai_settings (
  id text primary key default 'default',
  enabled boolean not null default true,
  welcome_message text not null default 'Hello. Welcome to Unique Care UK. I''m here to help answer your questions about our care services, care assessments, and support options. How can I help you today?',
  system_prompt text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.website_ai_settings enable row level security;

drop policy if exists "anon_select_ai_public_config" on public.website_ai_settings;
create policy "anon_select_ai_public_config"
  on public.website_ai_settings for select to anon, authenticated
  using (true);

-- ── Prompt version history ──────────────────────────────────────────────────
create table if not exists public.website_ai_prompt_versions (
  id bigint generated always as identity primary key,
  prompt text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists website_ai_prompt_versions_created_idx
  on public.website_ai_prompt_versions (created_at desc);

alter table public.website_ai_prompt_versions enable row level security;
-- No anon access — portal service role only.

-- ── Knowledge documents ─────────────────────────────────────────────────────
create table if not exists public.website_ai_documents (
  id bigint generated always as identity primary key,
  title text not null,
  file_name text not null,
  storage_key text not null,
  mime_type text not null default 'application/octet-stream',
  bytes integer,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'error', 'archived')),
  error_message text,
  chunk_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text
);

create index if not exists website_ai_documents_status_idx
  on public.website_ai_documents (status, created_at desc);

alter table public.website_ai_documents enable row level security;
-- No anon access.

-- ── Knowledge chunks (plain-text RAG) ───────────────────────────────────────
create table if not exists public.website_ai_chunks (
  id bigint generated always as identity primary key,
  document_id bigint not null references public.website_ai_documents(id) on delete cascade,
  chunk_index integer not null default 0,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists website_ai_chunks_document_idx
  on public.website_ai_chunks (document_id, chunk_index);

create index if not exists website_ai_chunks_content_fts_idx
  on public.website_ai_chunks using gin (to_tsvector('english', content));

alter table public.website_ai_chunks enable row level security;
-- No anon access.

-- ── Seed default settings + governance prompt ───────────────────────────────
insert into public.website_ai_settings (id, enabled, welcome_message, system_prompt, updated_by)
values (
  'default',
  true,
  'Hello. Welcome to Unique Care UK. I''m here to help answer your questions about our care services, care assessments, and support options. How can I help you today?',
  $prompt$
You are the Unique Care UK website assistant — a warm, caring, professional helper for families exploring domiciliary, live-in, and supported living care across London, Essex, and Hertfordshire.

Tone: compassionate, clear, trustworthy, and suitable for a regulated UK care provider. Use plain British English. Keep answers concise (2–4 short paragraphs unless the user asks for detail).

Rules you MUST follow:
1. Answer ONLY using the approved knowledge base excerpts and the facts provided in this system prompt / company context. Do not invent services, prices, availability, clinical advice, or CQC claims.
2. If the knowledge base does not contain the answer, say you do not have that information and invite the visitor to contact Unique Care UK (phone 020 3917 0260 or the contact form at /contact).
3. Never give medical diagnoses, medication advice, or safeguarding decisions. Encourage contacting the care team for personalised assessments.
4. For emergencies, tell the user to call 999. For urgent care needs during office hours, suggest calling Unique Care UK.
5. When helpful, point to relevant site pages: /services, /areas, /about, /careers, /contact, /reviews.
6. Do not discuss internal staffing systems, admin portals, or unpublished documents.
7. If asked something off-topic, politely redirect to care-related help.

Company context (high level — prefer knowledge base for detail):
- Unique Care UK is a division of Unique Resourcing Ltd (founded 2017).
- CQC rated Good; ISO 9001 & ISO 45001 certified.
- Services include domiciliary care, live-in care, supported living, dementia care, disabilities care, respite, palliative, and reablement.
- Free care assessment available via /contact.
$prompt$,
  'system'
)
on conflict (id) do nothing;

insert into public.website_ai_prompt_versions (prompt, note, created_by)
select system_prompt, 'Initial governance prompt', 'system'
from public.website_ai_settings
where id = 'default'
  and not exists (select 1 from public.website_ai_prompt_versions limit 1);
