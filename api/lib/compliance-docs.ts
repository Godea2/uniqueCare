/** Keys no longer collected on the candidate document form. */
export const REMOVED_COMPLIANCE_KEYS = ["employment_history", "qualifications"] as const;

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
    label: "Driver's License Document",
    guidance: "Upload a clear photo or scan of your driver's licence.",
    inputKind: "file",
  },
};

export function isRemovedComplianceKey(key: string): boolean {
  return (REMOVED_COMPLIANCE_KEYS as readonly string[]).includes(key);
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
