import { db } from "../db";
import type { JobPostings } from "@db/schema";
import { jobRequirements } from "./job-form";

export type PublicJobDto = {
  id: number;
  title: string;
  location: string | null;
  salaryText: string | null;
  employmentType: string | null;
  descriptionMd: string | null;
  publicSlug: string;
  applySlug: string | null;
  applyLinkEnabled: boolean;
  closesAt: string | null;
  createdAt: string | null;
  requirements: string[];
};

/** Live, not-yet-closed job postings for the marketing careers pages. */
export async function listPublicLiveJobs(): Promise<PublicJobDto[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.from("jobPostings").eq("status", "live").many<JobPostings>();
  return rows
    .filter((j) => !j.closesAt || String(j.closesAt) >= today)
    .map((j) => ({
      id: Number(j.id),
      title: j.title,
      location: j.location,
      salaryText: j.salaryText,
      employmentType: j.employmentType,
      descriptionMd: j.descriptionMd,
      publicSlug: j.publicSlug,
      applySlug: j.applySlug,
      applyLinkEnabled: !!j.applyLinkEnabled,
      closesAt: j.closesAt ? String(j.closesAt).slice(0, 10) : null,
      createdAt: j.createdAt ? String(j.createdAt) : null,
      requirements: jobRequirements(j).map((r) => r.label).filter(Boolean),
    }));
}
