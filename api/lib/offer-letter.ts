import type { Applications, OfferLetters } from "@db/schema";
import { db } from "../db";
import { saveDocument, documentDownloadUrl, readDocument } from "./cv-store";
import { renderTextPdf } from "./pdf-text";
import { registerOutgoingDocument } from "./outgoing-docs";

export function buildOfferLetter(o: {
  name: string; role: string; salary: string; orgName: string; signatory: string; signatoryTitle: string;
}): string {
  const today = new Date().toLocaleDateString("en-GB");
  return `${o.orgName.toUpperCase()} — OFFER OF EMPLOYMENT

Date: ${today}

Dear ${o.name},

We are delighted to offer you the position of ${o.role} at ${o.orgName}.

Pay: ${o.salary || "As discussed at interview"}
Hours: As per your contracted schedule, discussed at interview.
Start date: To be confirmed on completion of mandatory training.

This offer is made subject to satisfactory completion of all mandatory training and ongoing compliance with our regulatory requirements (CQC Regulation 19, Schedule 3).

Please accept this offer in your candidate portal by typing your full name as your electronic signature.

Yours sincerely,
${o.signatory}${o.signatoryTitle ? `\n${o.signatoryTitle}` : ""}
${o.orgName}`;
}

export const renderOfferPdf = renderTextPdf;

export function offerPdfFileName(candidateName: string): string {
  const safe = candidateName.replace(/[^\w.\- ]/g, "").trim().replace(/\s+/g, "-") || "Candidate";
  return `Offer-Letter-${safe}.pdf`;
}

/** Generate (or reuse) the PDF in storage and record keys on the offer row. */
export async function ensureOfferPdfStored(opts: {
  offer: OfferLetters;
  candidateId: number;
  candidateName: string;
  orgName?: string;
}): Promise<{ fileKey: string; fileName: string; bytes: Uint8Array }> {
  const fileName = opts.offer.pdfFileName || offerPdfFileName(opts.candidateName);
  if (opts.offer.pdfFileKey) {
    const existing = await readDocument(opts.offer.pdfFileKey);
    if (existing?.length) {
      await registerOutgoingDocument({
        kind: "offer_letter",
        title: `Offer letter — ${opts.candidateName}`,
        fileName,
        fileKey: opts.offer.pdfFileKey,
        candidateId: opts.candidateId,
        applicationId: Number(opts.offer.applicationId),
        relatedType: "offer_letters",
        relatedId: Number(opts.offer.id),
        issuedBy: "System",
      });
      return { fileKey: opts.offer.pdfFileKey, fileName, bytes: existing };
    }
  }
  const content = opts.offer.content ?? "Offer of employment";
  const bytes = renderOfferPdf(content, { title: `Offer — ${opts.candidateName}`, author: opts.orgName });
  const { key } = await saveDocument(`candidate-${opts.candidateId}/offers`, bytes, fileName, "application/pdf");
  try {
    await db.from("offerLetters").eq("id", opts.offer.id).update({
      pdfFileKey: key,
      pdfFileName: fileName,
    });
  } catch {
    // Columns arrive with migration 0011 — PDF is still returned for email attachment.
  }
  const app = await db.from("applications").eq("id", opts.offer.applicationId).first<Applications>();
  await registerOutgoingDocument({
    kind: "offer_letter",
    title: `Offer letter — ${opts.candidateName}`,
    fileName,
    fileKey: key,
    candidateId: opts.candidateId,
    applicationId: app ? Number(app.id) : Number(opts.offer.applicationId),
    relatedType: "offer_letters",
    relatedId: Number(opts.offer.id),
    issuedBy: "System",
  });
  return { fileKey: key, fileName, bytes };
}

/** Mark the stored PDF as the lasting hired copy (idempotent). */
export async function archiveOfferOnHire(opts: {
  offer: OfferLetters;
  candidateId: number;
  candidateName: string;
  orgName?: string;
  issuedBy?: string;
}): Promise<{ fileKey: string; fileName: string } | null> {
  const stored = await ensureOfferPdfStored(opts);
  try {
    await db.from("offerLetters").eq("id", opts.offer.id).update({
      archivedAt: new Date(),
      pdfFileKey: stored.fileKey,
      pdfFileName: stored.fileName,
    });
  } catch {
    /* column may be missing */
  }
  await registerOutgoingDocument({
    kind: "offer_letter",
    title: `Offer letter — ${opts.candidateName}`,
    fileName: stored.fileName,
    fileKey: stored.fileKey,
    candidateId: opts.candidateId,
    applicationId: Number(opts.offer.applicationId),
    relatedType: "offer_letters",
    relatedId: Number(opts.offer.id),
    issuedBy: opts.issuedBy ?? "System (hire)",
  });
  return { fileKey: stored.fileKey, fileName: stored.fileName };
}

export async function offerPdfDownloadUrl(fileKey: string): Promise<string> {
  return documentDownloadUrl(fileKey);
}
