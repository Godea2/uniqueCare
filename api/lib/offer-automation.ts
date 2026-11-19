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

/** templateVersion values used for the manual offer workflow (no DB migration required). */
export const OFFER_DRAFT = "draft";
export const OFFER_APPROVED = "approved";
export const OFFER_SENT = "v2";

export function offerIsDraft(offer: OfferLetters | null | undefined): boolean {
  return !!offer && !offer.sentAt;
}

export function offerIsApproved(offer: OfferLetters | null | undefined): boolean {
  return !!offer && !offer.sentAt && (offer.templateVersion === OFFER_APPROVED);
}

async function requiredComplianceVerified(app: Applications): Promise<boolean> {
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
  return reqs.length > 0 && reqs.every((r) =>
    docs.some((d) => d.requirementKey === r.key && d.status === "verified"));
}

/**
 * When every required compliance document (including references) is verified,
 * move to compliance_docs_complete and prepare a draft offer for recruiter review.
 * Does NOT email the candidate.
 */
export async function prepareOfferDraftIfReady(opts: {
  applicationId: number;
}): Promise<{ ready: boolean; offerId?: number; reason?: string }> {
  const app = await db.from("applications").eq("id", opts.applicationId).first<Applications>();
  if (!app) return { ready: false, reason: "Application not found" };

  const allowed = ["compliance_docs_requested", "approved", "compliance_docs_complete", "offer_sent"];
  if (!allowed.includes(app.stage)) {
    return { ready: false, reason: `Offer cannot be prepared from stage ${app.stage}` };
  }

  if (!(await requiredComplianceVerified(app))) {
    return { ready: false, reason: "Not all required compliance documents are verified yet" };
  }

  if (app.stage === "compliance_docs_requested" || app.stage === "approved") {
    await pushStage(app.id, "compliance_docs_complete", "System (automation)");
  }

  const existing = await db.from("offerLetters").eq("applicationId", app.id).order("id", "desc").first<OfferLetters>();
  if (existing) {
    return { ready: true, offerId: Number(existing.id), reason: existing.sentAt ? "Offer already sent" : "Draft already exists" };
  }

  const job = (await db.from("jobPostings").eq("id", app.jobPostingId).first<JobPostings>())!;
  const cand = await db.from("candidates").eq("id", app.candidateId).first<Candidates>();
  if (!cand) return { ready: false, reason: "Candidate not found" };
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
    applicationId: app.id,
    templateVersion: OFFER_DRAFT,
    content,
    sentAt: null,
  });

  await notifyRoles(["admin", "super_admin"], {
    type: "hr",
    title: "Offer letter ready for review",
    body: `All compliance documents (including references) are verified for application #${app.id}. Review, edit and approve the offer before sending.`,
    link: `/recruitment/pipeline/${app.id}`,
  });

  return { ready: true, offerId: Number(offer.id) };
}

/** After the last document verify — prepare draft only; never auto-email. */
export async function maybePrepareOfferAfterDocVerify(opts: {
  documentId: number;
}): Promise<void> {
  const doc = await db.from("complianceDocuments").eq("id", opts.documentId).first<ComplianceDocuments>();
  if (!doc || doc.ownerType !== "candidate") return;
  const app = await complianceApplication(Number(doc.ownerId));
  if (!app) return;
  if (!["compliance_docs_requested", "approved", "compliance_docs_complete"].includes(app.stage)) return;
  await prepareOfferDraftIfReady({ applicationId: Number(app.id) });
}

/**
 * Manually send (or resend) an approved offer letter.
 * Requires a draft that has been approved, unless forceResend of an already-sent offer.
 */
export async function sendOfferLetterManual(opts: {
  applicationId: number;
  baseUrl: string;
  actor: string;
  forceResend?: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  const app = await db.from("applications").eq("id", opts.applicationId).first<Applications>();
  if (!app) return { sent: false, reason: "Application not found" };

  if (!(await requiredComplianceVerified(app))) {
    return { sent: false, reason: "Not all required compliance documents are verified yet" };
  }

  let offer = await db.from("offerLetters").eq("applicationId", app.id).order("id", "desc").first<OfferLetters>();
  if (!offer) {
    const prepared = await prepareOfferDraftIfReady({ applicationId: app.id });
    if (!prepared.ready) return { sent: false, reason: prepared.reason ?? "Could not prepare offer draft" };
    offer = await db.from("offerLetters").eq("applicationId", app.id).order("id", "desc").first<OfferLetters>();
  }
  if (!offer) return { sent: false, reason: "No offer letter draft found" };

  if (offer.sentAt && !opts.forceResend) {
    return { sent: false, reason: "Offer already sent. Use resend if you need to send it again." };
  }

  if (!offer.sentAt && offer.templateVersion !== OFFER_APPROVED && !opts.forceResend) {
    return { sent: false, reason: "Approve the offer letter before sending it to the candidate." };
  }

  const cand = await db.from("candidates").eq("id", app.candidateId).first<Candidates>();
  if (!cand) return { sent: false, reason: "Candidate not found" };
  const org = await orgProfile();

  await db.from("offerLetters").eq("id", offer.id).update({
    sentAt: new Date(),
    templateVersion: OFFER_SENT,
  });
  const refreshed = { ...offer, sentAt: new Date().toISOString(), templateVersion: OFFER_SENT };

  try {
    await ensureOfferPdfStored({
      offer: refreshed,
      candidateId: Number(cand.id),
      candidateName: `${cand.firstName} ${cand.lastName}`,
      orgName: org.name,
    });
  } catch { /* emailCandidate regenerates if needed */ }

  if (app.stage !== "offer_sent") {
    if (app.stage === "compliance_docs_requested" || app.stage === "approved") {
      await pushStage(app.id, "compliance_docs_complete", opts.actor);
    }
    await pushStage(app.id, "offer_sent", opts.actor);
  }
  await emailCandidate(app.id, "offer_sent", opts.baseUrl);
  await notifyRoles(["admin", "super_admin"], {
    type: "hr",
    title: opts.forceResend ? "Offer letter resent" : "Offer letter sent",
    body: `Offer letter PDF emailed for application #${app.id}.`,
    link: `/recruitment/pipeline/${app.id}`,
  });
  return { sent: true };
}

/** @deprecated Use prepareOfferDraftIfReady + sendOfferLetterManual. Kept for any leftover callers. */
export async function issueOfferLetterIfReady(opts: {
  applicationId: number;
  baseUrl: string;
  forceResend?: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  const prepared = await prepareOfferDraftIfReady({ applicationId: opts.applicationId });
  if (!prepared.ready) return { sent: false, reason: prepared.reason };
  // Legacy callers that expected auto-send now only prepare a draft.
  if (!opts.forceResend) {
    return { sent: false, reason: "Offer draft is ready for review. Approve and send it manually." };
  }
  return sendOfferLetterManual({
    applicationId: opts.applicationId,
    baseUrl: opts.baseUrl,
    actor: "System",
    forceResend: true,
  });
}

/** @deprecated */
export async function maybeIssueOfferAfterDocVerify(opts: {
  documentId: number;
  baseUrl: string;
}): Promise<void> {
  await maybePrepareOfferAfterDocVerify({ documentId: opts.documentId });
}
