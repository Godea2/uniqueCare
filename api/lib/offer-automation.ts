import { db } from "../db";
import type {
  Applications,
  Candidates,
  ComplianceDocuments,
  ComplianceRequirements,
  JobPostings,
  OfferLetters,
} from "@db/schema";
import { buildOfferLetter, ensureOfferPdfStored } from "./offer-letter";
import { orgProfile } from "./app-url";
import { complianceApplication, emailCandidate, pushStage } from "./recruitment";
import { shouldRequestComplianceFromCandidate } from "./compliance-docs";
import { notifyRoles } from "../util";

/**
 * When every required compliance document is verified, generate the offer PDF,
 * email it, and move the application to offer_sent.
 * Safe to call repeatedly — skips if an offer already exists (unless resend).
 */
export async function issueOfferLetterIfReady(opts: {
  applicationId: number;
  baseUrl: string;
  forceResend?: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  const app = await db.from("applications").eq("id", opts.applicationId).first<Applications>();
  if (!app) return { sent: false, reason: "Application not found" };

  const allowed = ["compliance_docs_requested", "approved", "compliance_docs_complete", "offer_sent"];
  if (!allowed.includes(app.stage)) {
    return { sent: false, reason: `Offer cannot be sent from stage ${app.stage}` };
  }

  const cand = await db.from("candidates").eq("id", app.candidateId).first<Candidates>();
  const hasDrivingLicence = !!cand?.hasDrivingLicence;
  const reqs = (await db.from("complianceRequirements").eq("required", true).many<ComplianceRequirements>())
    .filter((r) => shouldRequestComplianceFromCandidate(r.key, { hasDrivingLicence }));
  if (hasDrivingLicence) {
    const driving = await db.from("complianceRequirements").eq("key", "driving_docs").first<ComplianceRequirements>();
    if (driving && !reqs.some((r) => r.key === "driving_docs")) reqs.push(driving);
  }
  const docs = await db.from("complianceDocuments")
    .eq("ownerType", "candidate").eq("ownerId", app.candidateId).many<ComplianceDocuments>();
  const allVerified = reqs.length > 0 && reqs.every((r) =>
    docs.some((d) => d.requirementKey === r.key && d.status === "verified"));
  if (!allVerified) {
    return { sent: false, reason: "Not all required compliance documents are verified yet" };
  }

  if (app.stage === "compliance_docs_requested" || app.stage === "approved") {
    await pushStage(app.id, "compliance_docs_complete", "System (automation)");
  }

  const existing = await db.from("offerLetters").eq("applicationId", app.id).order("id", "desc").first<OfferLetters>();
  if (existing && !opts.forceResend) {
    if (app.stage !== "offer_sent") {
      await pushStage(app.id, "offer_sent", "System (automation)");
      await emailCandidate(app.id, "offer_sent", opts.baseUrl);
    }
    return { sent: true, reason: "Offer already existed" };
  }

  const job = (await db.from("jobPostings").eq("id", app.jobPostingId).first<JobPostings>())!;
  if (!cand) return { sent: false, reason: "Candidate not found" };
  const org = await orgProfile();
  const content = buildOfferLetter({
    name: `${cand.firstName} ${cand.lastName}`,
    role: job.title,
    salary: job.salaryText ?? "",
    orgName: org.name,
    signatory: org.signatory,
    signatoryTitle: org.signatoryTitle,
  });
  const [offer] = await db.from("offerLetters").insert<OfferLetters>({
    applicationId: app.id, templateVersion: "v2", content, sentAt: new Date(),
  });
  try {
    await ensureOfferPdfStored({
      offer,
      candidateId: Number(cand.id),
      candidateName: `${cand.firstName} ${cand.lastName}`,
      orgName: org.name,
    });
  } catch { /* emailCandidate regenerates if needed */ }

  if (app.stage !== "offer_sent") {
    await pushStage(app.id, "offer_sent", "System (automation)");
  }
  await emailCandidate(app.id, "offer_sent", opts.baseUrl);
  await notifyRoles(["admin", "super_admin"], {
    type: "hr",
    title: opts.forceResend ? "Offer letter resent" : "Offer letter sent automatically",
    body: `Offer letter PDF emailed for application #${app.id}.`,
    link: `/recruitment/pipeline/${app.id}`,
  });
  return { sent: true };
}

/** After the last document verify for a candidate, try to issue the offer. */
export async function maybeIssueOfferAfterDocVerify(opts: {
  documentId: number;
  baseUrl: string;
}): Promise<void> {
  const doc = await db.from("complianceDocuments").eq("id", opts.documentId).first<ComplianceDocuments>();
  if (!doc || doc.ownerType !== "candidate") return;
  const app = await complianceApplication(Number(doc.ownerId));
  if (!app) return;
  if (!["compliance_docs_requested", "approved", "compliance_docs_complete"].includes(app.stage)) return;
  await issueOfferLetterIfReady({ applicationId: Number(app.id), baseUrl: opts.baseUrl });
}
