/** Keys no longer collected on the candidate document form. */
export const REMOVED_COMPLIANCE_KEYS = [
  "employment_history",
  "qualifications",
  "health_declaration",
] as const;

/**
 * Documents that are verified once and must never generate expiry reminders.
 * (Proof of address must be recent at hire, but is not re-tracked after verification.)
 */
export const NON_EXPIRING_COMPLIANCE_KEYS = [
  "bank_details",
  "signed_contract",
  "reference_1",
  "reference_2",
  "proof_of_address",
  "health_declaration",
  "employment_history",
  "qualifications",
] as const;

/**
 * Handled by the office / later pipeline stages — not something the candidate
 * uploads on the pre-offer compliance checklist.
 * - signed_contract: issued with the offer; signed copy comes after
 * - dbs_enhanced: employer-led check; tracked at the DBS stage after training
 */
export const HR_ONLY_COMPLIANCE_KEYS = [
  "signed_contract",
  "dbs_enhanced",
] as const;

/** Only request a driving licence upload when the candidate said they drive. */
export const CONDITIONAL_DRIVING_KEY = "driving_docs";

/**
 * Keys that should drive expiry alerts when they have an expires_at date.
 * Photo ID / licence expiry is optional (from the document itself), never auto-invented.
 */
export const EXPIRY_TRACKED_COMPLIANCE_KEYS = [
  "dbs_enhanced",
  "right_to_work",
  "photo_id",
  "driving_docs",
] as const;

export type ComplianceInputKind = "file" | "text";

type Override = {
  label?: string;
  guidance?: string;
  inputKind?: ComplianceInputKind;
};

/**
 * Display / behaviour overrides for the candidate document form.
 * Applied on top of DB rows so the portal stays correct even before migration 0010 runs.
 */
export const COMPLIANCE_OVERRIDES: Record<string, Override> = {
  bank_details: {
    label: "Bank details for payroll",
    guidance: "Enter your bank account details for payroll (account name, sort code, and account number).",
    inputKind: "text",
  },
  reference_1: {
    label: "Reference 1",
    guidance: "Enter the name, organisation, email and phone number for your most recent care employer.",
    inputKind: "text",
  },
  reference_2: {
    label: "Reference 2",
    guidance: "Enter the name, organisation, email and phone number for your second referee.",
    inputKind: "text",
  },
  right_to_work: {
    label: "Right to work",
    guidance: "Enter Share Code",
    inputKind: "text",
  },
  proof_of_address: {
    label: "Proof of address (under 3 months old)",
    guidance: "Utility Bill",
    inputKind: "file",
  },
  driving_docs: {
    label: "Driver's Licence",
    guidance: "Upload a clear photo or scan of your driver's licence (both sides if needed).",
    inputKind: "file",
  },
  signed_contract: {
    label: "Signed contract",
    guidance: "Recorded by the office after the offer is accepted — not requested from the candidate here.",
  },
  dbs_enhanced: {
    label: "Enhanced DBS with adult barred list",
    guidance: "Arranged by the office after training — not a candidate upload on this checklist.",
  },
};

export function isRemovedComplianceKey(key: string): boolean {
  return (REMOVED_COMPLIANCE_KEYS as readonly string[]).includes(key);
}

export function isNonExpiringComplianceKey(key: string): boolean {
  return (NON_EXPIRING_COMPLIANCE_KEYS as readonly string[]).includes(key);
}

export function isHrOnlyComplianceKey(key: string): boolean {
  return (HR_ONLY_COMPLIANCE_KEYS as readonly string[]).includes(key);
}

/** Only DBS, RTW, photo ID, driving docs should appear on expiry boards when dated. */
export function complianceKeyTracksExpiry(key: string): boolean {
  if (isNonExpiringComplianceKey(key) || isRemovedComplianceKey(key)) return false;
  return (EXPIRY_TRACKED_COMPLIANCE_KEYS as readonly string[]).includes(key);
}

/**
 * Should this key appear on the candidate portal checklist / block the offer?
 * HR-only and retired keys never do. Driving licence only when they said they drive.
 */
export function shouldRequestComplianceFromCandidate(
  key: string,
  opts?: { hasDrivingLicence?: boolean | null },
): boolean {
  if (isRemovedComplianceKey(key)) return false;
  if (isHrOnlyComplianceKey(key)) return false;
  if (key === CONDITIONAL_DRIVING_KEY) return !!opts?.hasDrivingLicence;
  return true;
}

export function resolveComplianceRequirement(req: {
  key: string;
  label: string;
  guidance?: string | null;
  inputKind?: string | null;
}): { key: string; label: string; guidance: string | null; inputKind: ComplianceInputKind } {
  const o = COMPLIANCE_OVERRIDES[req.key] ?? {};
  const kind = (o.inputKind ?? req.inputKind ?? "file") as ComplianceInputKind;
  return {
    key: req.key,
    label: o.label ?? req.label,
    guidance: o.guidance ?? req.guidance ?? null,
    inputKind: kind === "text" ? "text" : "file",
  };
}
