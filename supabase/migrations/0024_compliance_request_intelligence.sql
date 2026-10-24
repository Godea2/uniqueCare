-- Smarter pre-offer compliance requests:
-- - Driving licence is not always required (only when the candidate drives)
-- - Do not invent expiry on licence / photo ID (HR enters the date from the document)
-- - Cancel open candidate requests for HR-led items (signed contract, DBS) and retired health declaration

-- 1. Driving licence: optional in catalog; app requests it only when has_driving_licence
update public.compliance_requirements
   set required = false,
       expires_after_months = null,
       label = 'Driver''s Licence',
       guidance = 'Upload a clear photo or scan of your driver''s licence (both sides if needed).'
 where key = 'driving_docs';

-- 2. Photo ID: never auto-expire from a fixed month count
update public.compliance_requirements
   set expires_after_months = null
 where key = 'photo_id';

-- 3. Right to work: share code may have a validity window — keep tracking but no invented months if already null
-- (left as-is from 0015 / 0022)

-- 4. Cancel mistaken open candidate upload requests for HR-only / retired keys
update public.compliance_documents
   set status = 'cancelled'
 where owner_type = 'candidate'
   and requirement_key in ('signed_contract', 'dbs_enhanced', 'health_declaration', 'employment_history', 'qualifications')
   and status in ('requested', 'rejected');

-- 5. Clear invented expiry dates on one-off / non-tracked candidate docs
update public.compliance_documents
   set expires_at = null
 where requirement_key in (
     'bank_details', 'signed_contract', 'reference_1', 'reference_2',
     'proof_of_address', 'health_declaration', 'employment_history', 'qualifications'
   )
   and expires_at is not null;

-- 6. Drop reminder rows tied to those cleared docs
delete from public.document_expiry_reminders der
 using public.compliance_documents cd
 where der.subject_type = 'compliance'
   and der.subject_id = cd.id
   and cd.requirement_key in (
     'bank_details', 'signed_contract', 'reference_1', 'reference_2',
     'proof_of_address', 'health_declaration', 'employment_history', 'qualifications'
   );
