-- Candidate document form: text vs file inputs, guidance, label updates, retire unused docs.
-- Safe / idempotent. Run in the Supabase SQL editor.

alter table public.compliance_requirements
  add column if not exists guidance text,
  add column if not exists input_kind text not null default 'file';

alter table public.compliance_documents
  add column if not exists text_value text;

-- Labels + guidance + input kinds
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

update public.compliance_requirements set
  label = 'Driver''s License Document',
  guidance = 'Upload a clear photo or scan of your driver''s licence.',
  input_kind = 'file'
where key = 'driving_docs';

-- Remove qualifications and employment history from the checklist
update public.compliance_requirements
set required = false
where key in ('employment_history', 'qualifications');

-- Drop outstanding requests for retired document types (keep verified history if any)
update public.compliance_documents
set status = 'cancelled'
where requirement_key in ('employment_history', 'qualifications')
  and status in ('requested', 'rejected', 'uploaded');
