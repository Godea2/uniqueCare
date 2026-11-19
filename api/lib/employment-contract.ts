import { db } from "../db";
import type {
  Applications,
  Candidates,
  ComplianceDocuments,
  JobPostings,
  OfferLetters,
} from "@db/schema";
import { orgProfile } from "./app-url";
import { renderTextPdf } from "./pdf-text";
import { saveDocument } from "./cv-store";
import { registerOutgoingDocument } from "./outgoing-docs";
import { emailCandidate } from "./recruitment";
import { notifyRoles } from "../util";

export function buildEmploymentContract(o: {
  name: string;
  role: string;
  salary: string;
  orgName: string;
  signatory: string;
  signatoryTitle: string;
  startDate?: string | null;
}): string {
  const today = new Date().toLocaleDateString("en-GB");
  return `${o.orgName.toUpperCase()} — MAIN EMPLOYMENT CONTRACT

Date: ${today}

Dear ${o.name},

This is your main employment contract for the position of ${o.role} with ${o.orgName}.

Pay: ${o.salary || "As set out in your offer letter"}
Hours: As per your contracted schedule
Start date: ${o.startDate || "As confirmed by your manager"}

This contract sets out the terms and conditions of your employment and should be read together with your offer letter and staff handbook.

Please read this carefully. Your manager will arrange for you to sign and return a copy for your staff file.

Yours sincerely,
${o.signatory}${o.signatoryTitle ? `\n${o.signatoryTitle}` : ""}
${o.orgName}`;
}

/**
 * After the referee / compliance stage is complete (and ideally after offer acceptance),
 * recruiters can manually send the main employment contract.
 */
export async function sendEmploymentContract(opts: {
  applicationId: number;
  baseUrl: string;
  actor: string;
}): Promise<{ sent: boolean; reason?: string; fileKey?: string }> {
  const app = await db.from("applications").eq("id", opts.applicationId).first<Applications>();
  if (!app) return { sent: false, reason: "Application not found" };

  const allowedStages = [
    "compliance_docs_complete",
    "offer_sent",
    "offer_accepted",
    "training_booked",
    "online_training_in_progress",
    "dbs_verified",
    "training_complete",
    "hired",
  ];
  if (!allowedStages.includes(app.stage)) {
    return {
      sent: false,
      reason: "Complete compliance documents (including references) before sending the employment contract.",
    };
  }

  const cand = await db.from("candidates").eq("id", app.candidateId).first<Candidates>();
  if (!cand) return { sent: false, reason: "Candidate not found" };
  const job = await db.from("jobPostings").eq("id", app.jobPostingId).first<JobPostings>();
  const org = await orgProfile();
  const offer = await db.from("offerLetters").eq("applicationId", app.id).order("id", "desc").first<OfferLetters>();

  const answers = (app.answers ?? {}) as Record<string, unknown>;
  const startDate = typeof answers.earliest_start === "string" ? answers.earliest_start.slice(0, 10) : null;

  // Prefer salary wording from the offer content when present.
  let salary = job?.salaryText ?? "";
  if (offer?.content) {
    const payLine = offer.content.split("\n").find((l) => /^Pay:/i.test(l.trim()));
    if (payLine) salary = payLine.replace(/^Pay:\s*/i, "").trim();
  }

  const content = buildEmploymentContract({
    name: `${cand.firstName} ${cand.lastName}`,
    role: job?.title ?? "Care Worker",
    salary,
    orgName: org.name,
    signatory: org.signatory,
    signatoryTitle: org.signatoryTitle,
    startDate,
  });

  const safe = `${cand.firstName}-${cand.lastName}`.replace(/[^\w.\- ]/g, "").trim().replace(/\s+/g, "-") || "Candidate";
  const fileName = `Employment-Contract-${safe}.pdf`;
  const bytes = renderTextPdf(content, { title: `Employment contract — ${cand.firstName} ${cand.lastName}`, author: org.name });
  const { key } = await saveDocument(`candidate-${cand.id}/contracts`, bytes, fileName, "application/pdf");

  await registerOutgoingDocument({
    kind: "employment_contract",
    title: `Main employment contract — ${cand.firstName} ${cand.lastName}`,
    fileName,
    fileKey: key,
    candidateId: Number(cand.id),
    applicationId: Number(app.id),
    relatedType: "applications",
    relatedId: Number(app.id),
    issuedBy: opts.actor,
  });

  // Record / refresh the HR-only signed_contract compliance row as issued to the candidate.
  const existing = await db.from("complianceDocuments")
    .eq("ownerType", "candidate")
    .eq("ownerId", cand.id)
    .eq("requirementKey", "signed_contract")
    .first<ComplianceDocuments>();
  if (existing) {
    await db.from("complianceDocuments").eq("id", existing.id).update({
      status: "uploaded",
      fileName,
      fileKey: key,
      rejectionReason: null,
    });
  } else {
    await db.from("complianceDocuments").insert({
      ownerType: "candidate",
      ownerId: cand.id,
      requirementKey: "signed_contract",
      fileName,
      fileKey: key,
      status: "uploaded",
    });
  }

  await emailCandidate(app.id, "employment_contract_sent", opts.baseUrl, {
    attachment: { filename: fileName, content: bytes, contentType: "application/pdf" },
  });

  await notifyRoles(["admin", "super_admin"], {
    type: "hr",
    title: "Employment contract sent",
    body: `Main employment contract emailed for application #${app.id}.`,
    link: `/recruitment/pipeline/${app.id}`,
  });

  return { sent: true, fileKey: key };
}
