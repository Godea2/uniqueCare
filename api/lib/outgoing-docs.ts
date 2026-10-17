import type {
  Applications, Candidates, OfferLetters, OutgoingDocuments, TrainingCourses, TrainingEnrolments,
} from "@db/schema";
import { db } from "../db";
import { documentDownloadUrl } from "./cv-store";

export const OUTGOING_KINDS = [
  "offer_letter",
  "training_certificate",
  "training_outcome",
] as const;

export type OutgoingKind = (typeof OUTGOING_KINDS)[number];

export const OUTGOING_KIND_LABEL: Record<OutgoingKind, string> = {
  offer_letter: "Offer letter",
  training_certificate: "Training certificate",
  training_outcome: "Training outcome letter",
};

/** Register (or refresh) an issued document in the central outgoing registry. */
export async function registerOutgoingDocument(opts: {
  kind: OutgoingKind;
  title: string;
  fileName: string;
  fileKey: string;
  contentType?: string;
  candidateId?: number | null;
  applicationId?: number | null;
  relatedType?: string | null;
  relatedId?: number | null;
  issuedBy?: string | null;
  issuedAt?: Date;
}): Promise<OutgoingDocuments | null> {
  const row = {
    kind: opts.kind,
    title: opts.title,
    fileName: opts.fileName,
    fileKey: opts.fileKey,
    contentType: opts.contentType ?? "application/pdf",
    candidateId: opts.candidateId ?? null,
    applicationId: opts.applicationId ?? null,
    relatedType: opts.relatedType ?? null,
    relatedId: opts.relatedId ?? null,
    issuedBy: opts.issuedBy ?? null,
    issuedAt: opts.issuedAt ?? new Date(),
  };
  try {
    if (opts.relatedType && opts.relatedId != null) {
      const existing = await db.from("outgoingDocuments")
        .eq("relatedType", opts.relatedType)
        .eq("relatedId", opts.relatedId)
        .eq("kind", opts.kind)
        .first<OutgoingDocuments>();
      if (existing) {
        await db.from("outgoingDocuments").eq("id", existing.id).update({
          title: row.title,
          fileName: row.fileName,
          fileKey: row.fileKey,
          contentType: row.contentType,
          candidateId: row.candidateId,
          applicationId: row.applicationId,
          issuedBy: row.issuedBy ?? existing.issuedBy,
          issuedAt: row.issuedAt,
        });
        return { ...existing, ...row, issuedAt: row.issuedAt.toISOString?.() ?? String(row.issuedAt) } as OutgoingDocuments;
      }
    }
    const [created] = await db.from("outgoingDocuments").insert<OutgoingDocuments>(row);
    return created;
  } catch {
    // Table arrives with migration 0013 — issuing still works without the registry.
    return null;
  }
}

export async function outgoingDocumentUrl(fileKey: string) {
  return documentDownloadUrl(fileKey);
}

/** Backfill the registry from offer PDFs and training outcome files already on disk. */
export async function syncOutgoingFromSources(): Promise<number> {
  let n = 0;
  try {
    const offers = await db.from("offerLetters").notNull("pdfFileKey").many<OfferLetters>();
    const apps = await db.from("applications").many<Applications>();
    const cands = await db.from("candidates").many<Candidates>();
    for (const offer of offers) {
      if (!offer.pdfFileKey) continue;
      const app = apps.find((a) => Number(a.id) === Number(offer.applicationId));
      const cand = app ? cands.find((c) => Number(c.id) === Number(app.candidateId)) : undefined;
      const name = cand ? `${cand.firstName} ${cand.lastName}` : `Application #${offer.applicationId}`;
      const reg = await registerOutgoingDocument({
        kind: "offer_letter",
        title: `Offer letter — ${name}`,
        fileName: offer.pdfFileName || `Offer-Letter.pdf`,
        fileKey: offer.pdfFileKey,
        candidateId: cand ? Number(cand.id) : null,
        applicationId: Number(offer.applicationId),
        relatedType: "offer_letters",
        relatedId: Number(offer.id),
        issuedBy: "System (sync)",
        issuedAt: offer.sentAt ? new Date(offer.sentAt) : undefined,
      });
      if (reg) n++;
    }

    const enrolments = await db.from("trainingEnrolments").notNull("outcomeFileKey").many<TrainingEnrolments>();
    const courses = await db.from("trainingCourses").many<TrainingCourses>();
    for (const e of enrolments) {
      if (!e.outcomeFileKey || (e.outcome !== "pass" && e.outcome !== "fail")) continue;
      const cand = cands.find((c) => Number(c.id) === Number(e.personId) && e.personType === "candidate");
      if (!cand) continue;
      const course = courses.find((c) => Number(c.id) === Number(e.courseId));
      const name = `${cand.firstName} ${cand.lastName}`;
      const courseTitle = course?.title ?? "Training";
      const app = apps.find((a) => Number(a.candidateId) === Number(cand.id));
      const reg = await registerOutgoingDocument({
        kind: e.outcome === "pass" ? "training_certificate" : "training_outcome",
        title: e.outcome === "pass"
          ? `Certificate — ${courseTitle} — ${name}`
          : `Training outcome — ${courseTitle} — ${name}`,
        fileName: e.outcomeFileName || "training-document.pdf",
        fileKey: e.outcomeFileKey,
        candidateId: Number(cand.id),
        applicationId: app ? Number(app.id) : null,
        relatedType: "training_enrolments",
        relatedId: Number(e.id),
        issuedBy: "System (sync)",
        issuedAt: e.outcomeAt ? new Date(e.outcomeAt) : undefined,
      });
      if (reg) n++;
    }
  } catch {
    return 0;
  }
  return n;
}
