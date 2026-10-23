-- Stop false expiry emails for one-off hire documents.
-- Health declaration is retired from the checklist.
-- Bank details, signed contract, references and proof of address do not expire.

-- 1. Retire health declaration (same pattern as employment_history / qualifications)
update public.compliance_requirements
set required = false,
    expires_after_months = null
where key = 'health_declaration';

update public.compliance_documents
set status = 'cancelled'
where requirement_key = 'health_declaration'
  and status in ('requested', 'rejected', 'uploaded');

-- 2. These keys never expire going forward
update public.compliance_requirements
set expires_after_months = null
where key in (
  'bank_details',
  'signed_contract',
  'reference_1',
  'reference_2',
  'proof_of_address',
  'health_declaration'
);

-- 3. Clear any incorrectly stored expiry dates on existing rows
update public.compliance_documents
set expires_at = null
where requirement_key in (
  'bank_details',
  'signed_contract',
  'reference_1',
  'reference_2',
  'proof_of_address',
  'health_declaration',
  'employment_history',
  'qualifications'
)
  and expires_at is not null;

-- 4. Drop reminder state for those documents so cron cannot re-fire from stale rows
delete from public.document_expiry_reminders der
using public.compliance_documents cd
where der.subject_type = 'compliance'
  and der.subject_id = cd.id
  and cd.requirement_key in (
    'bank_details',
    'signed_contract',
    'reference_1',
    'reference_2',
    'proof_of_address',
    'health_declaration',
    'employment_history',
    'qualifications'
  );
