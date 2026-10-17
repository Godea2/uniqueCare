-- Central registry of documents we issue (offer letters, certificates, outcome letters).
-- Separate from candidate-uploaded compliance documents. Safe / idempotent.

create table if not exists public.outgoing_documents (
  id bigint generated always as identity primary key,
  kind text not null,
  title text not null,
  file_name text not null,
  file_key text not null,
  content_type text not null default 'application/pdf',
  candidate_id bigint,
  application_id bigint,
  related_type text,
  related_id bigint,
  issued_at timestamptz not null default now(),
  issued_by text,
  created_at timestamptz not null default now()
);

create unique index if not exists outgoing_documents_related_kind_uidx
  on public.outgoing_documents (related_type, related_id, kind)
  where related_type is not null and related_id is not null;

create index if not exists outgoing_documents_kind_idx on public.outgoing_documents (kind);
create index if not exists outgoing_documents_issued_at_idx on public.outgoing_documents (issued_at desc);
create index if not exists outgoing_documents_candidate_idx on public.outgoing_documents (candidate_id);

alter table public.outgoing_documents enable row level security;

comment on table public.outgoing_documents is
  'Documents issued by the organisation (offers, certificates) — not candidate uploads.';
