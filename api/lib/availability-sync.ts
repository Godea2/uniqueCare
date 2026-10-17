import { db } from "../db";
import type { Applications, ApplicationFormVersions, StaffAvailability } from "@db/schema";
import {
  findAvailabilityAnswer,
  gridToStaffWindows,
  parseAvailabilityGrid,
} from "@contracts/availability";
import { formSchemaDoc, type FormAnswers } from "@contracts/form-schema";
import { audit } from "../util";

/**
 * Write applicant availability_grid ticks into staff_availability.
 * - Replaces existing rows only when `replace` is true, or when the staff
 *   member currently has no availability (so we never wipe coordinator edits
 *   on a re-hire by accident).
 * - Returns how many windows were written (0 = nothing to sync / skipped).
 */
export async function syncStaffAvailabilityFromApplication(opts: {
  staffId: number;
  application: Pick<Applications, "id" | "answers" | "formVersionId">;
  actorName: string;
  /** Force overwrite existing windows (default: only when staff has none). */
  replace?: boolean;
}): Promise<{ written: number; skipped: boolean; reason?: string }> {
  const existing = await db.from("staffAvailability")
    .eq("staffId", opts.staffId)
    .many<StaffAvailability>();

  if (existing.length > 0 && !opts.replace) {
    return { written: 0, skipped: true, reason: "staff_already_has_availability" };
  }

  let schema = null;
  if (opts.application.formVersionId) {
    const ver = await db.from("applicationFormVersions")
      .eq("id", opts.application.formVersionId)
      .first<ApplicationFormVersions>();
    const parsed = ver ? formSchemaDoc.safeParse(ver.schemaJson) : null;
    if (parsed?.success) schema = parsed.data;
  }

  const answers = (opts.application.answers ?? {}) as FormAnswers;
  const raw = findAvailabilityAnswer(answers, schema);
  const grid = parseAvailabilityGrid(raw);
  if (!grid) {
    return { written: 0, skipped: true, reason: "no_availability_answer" };
  }

  const windows = gridToStaffWindows(grid);
  if (windows.length === 0) {
    return { written: 0, skipped: true, reason: "empty_grid" };
  }

  // Clear previous rows when replacing or when we found leftover empties
  if (existing.length > 0) {
    for (const row of existing) {
      await db.from("staffAvailability").eq("id", row.id).delete();
    }
  }

  for (const w of windows) {
    await db.from("staffAvailability").insert({
      staffId: opts.staffId,
      dayOfWeek: w.dayOfWeek,
      startTime: w.startTime,
      endTime: w.endTime,
    });
  }

  await audit(opts.actorName, "staff_availability_synced_from_application", "staff_profile", opts.staffId, {
    applicationId: opts.application.id,
    windows: windows.length,
    grid,
  });

  return { written: windows.length, skipped: false };
}
