-- Persist downloadable offer-letter PDFs on candidate offer records.
-- Safe / idempotent. Run in the Supabase SQL editor.

alter table public.offer_letters
  add column if not exists pdf_file_key text,
  add column if not exists pdf_file_name text,
  add column if not exists archived_at timestamptz;

comment on column public.offer_letters.pdf_file_key is
  'Storage key for the PDF copy of the offer letter (documents bucket).';
comment on column public.offer_letters.archived_at is
  'Set when the candidate is hired — PDF remains downloadable from the profile.';
