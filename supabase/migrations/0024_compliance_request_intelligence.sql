-- Smarter pre-offer compliance requests (safe if earlier form migrations were skipped):
-- - Ensure guidance / input_kind columns exist (from 0010)
-- - Driving licence optional; no invented expiry on photo ID / licence
-- - Cancel open candidate requests for HR-led items (contract, DBS) and retired keys

-- 0. Columns from 0010 (no-op if already present)
alter table public.compliance_requirements
  add column if not exists guidance text;
alter table public.compliance_requirements
  add column if not exists input_kind text;
update public.compliance_requirements
   set input_kind = 'file'
 where input_kind is null;
alter table public.compliance_requirements
  alter column input_kind set default 'file';
alter table public.compliance_documents
  add column if not exists text_value text;

-- Text vs file for the candidate form
update public.compliance_requirements set
  label = 'Right to work',
  guidance = 'Enter Share Code',
  input_kind = 'text'
where key = 'right_to_work';

update public.compliance_requirements set
  label = 'Proof of address (under 3 months old)',
  guidance = 'Utility Bill',
  input_kind = 'file'
where key = 'proof_of_address';

update public.compliance_requirements set
  label = 'Bank details for payroll',
  guidance = 'Enter your bank account details for payroll (account name, sort code, and account number).',
  input_kind = 'text'
where key = 'bank_details';

update public.compliance_requirements set
  label = 'Reference 1',
  guidance = 'Enter the name, organisation, email and phone number for your most recent care employer.',
  input_kind = 'text'
where key = 'reference_1';

update public.compliance_requirements set
  label = 'Reference 2',
  guidance = 'Enter the name, organisation, email and phone number for your second referee.',
  input_kind = 'text'
where key = 'reference_2';

-- 1. Driving licence: optional; request only when candidate drives
update public.compliance_requirements
   set required = false,
       expires_after_months = null,
       label = 'Driver''s Licence',
       guidance = 'Upload a clear photo or scan of your driver''s licence (both sides if needed).',
       input_kind = 'file'
 where key = 'driving_docs';

-- 2. Photo ID: never auto-expire from a fixed month count
update public.compliance_requirements
   set expires_after_months = null
 where key = 'photo_id';

-- 3. Retire unused checklist items
update public.compliance_requirements
   set required = false,
       expires_after_months = null
 where key in ('employment_history', 'qualifications', 'health_declaration');

-- 4. Cancel mistaken open candidate upload requests for HR-only / retired keys
update public.compliance_documents
   set status = 'cancelled'
 where owner_type = 'candidate'
   and requirement_key in (
     'signed_contract', 'dbs_enhanced', 'health_declaration',
     'employment_history', 'qualifications'
   )
   and status in ('requested', 'rejected');

-- 5. Clear invented expiry dates on one-off / non-tracked docs
update public.compliance_documents
   set expires_at = null
 where requirement_key in (
     'bank_details', 'signed_contract', 'reference_1', 'reference_2',
     'proof_of_address', 'health_declaration', 'employment_history', 'qualifications'
   )
   and expires_at is not null;

-- 6. Drop reminder rows for those cleared docs (skip if tracker table not created yet)
do $$
begin
  if to_regclass('public.document_expiry_reminders') is not null then
    delete from public.document_expiry_reminders der
     using public.compliance_documents cd
     where der.subject_type = 'compliance'
       and der.subject_id = cd.id
       and cd.requirement_key in (
         'bank_details', 'signed_contract', 'reference_1', 'reference_2',
         'proof_of_address', 'health_declaration', 'employment_history', 'qualifications'
       );
  end if;
end $$;
