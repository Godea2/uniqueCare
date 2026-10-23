import { db } from "../db";
import type {
  CarePlans,
  Clients,
  ComplianceDocuments,
  ComplianceRequirements,
  DocumentExpiryReminders,
  Organisations,
  PlanReviews,
  StaffProfiles,
  TrainingCourses,
  TrainingEnrolments,
} from "@db/schema";
import { audit, notify, notifyRoles, ruleEnabled } from "../util";

export type Rag = "green" | "amber" | "red";

export const MANDATORY_ROTA_KEYS = ["dbs_enhanced", "right_to_work"] as const;
export const EXPIRY_MANAGER_ROLES = ["super_admin", "admin", "care_coordinator"] as const;
export const PLAN_REVIEW_ALERT_ROLES = ["super_admin", "care_coordinator"] as const;

const AMBER_DAYS = 30;

export function daysUntil(dateStr: string, today = new Date().toISOString().slice(0, 10)): number {
  const a = Date.parse(`${today}T12:00:00Z`);
  const b = Date.parse(`${dateStr.slice(0, 10)}T12:00:00Z`);
  return Math.round((b - a) / 864e5);
}

export function ragForExpiry(expiresAt: string | null | undefined, today = new Date().toISOString().slice(0, 10)): Rag {
  if (!expiresAt) return "green";
  const days = daysUntil(expiresAt, today);
  if (days < 0) return "red";
  if (days <= AMBER_DAYS) return "amber";
  return "green";
}

/** Escalation band: null = too far out to remind yet. */
export function reminderBand(daysLeft: number): { level: string; minIntervalDays: number } | null {
  if (daysLeft > 60) return null;
  if (daysLeft > 30) return { level: "60", minIntervalDays: 14 };
  if (daysLeft > 7) return { level: "30", minIntervalDays: 7 };
  if (daysLeft > 0) return { level: "7", minIntervalDays: 1 };
  return { level: "0", minIntervalDays: 1 };
}

function levelRank(level: string | null | undefined): number {
  if (level === "0") return 4;
  if (level === "7") return 3;
  if (level === "30") return 2;
  if (level === "60") return 1;
  return 0;
}

export function shouldSendReminder(
  band: { level: string; minIntervalDays: number },
  state: DocumentExpiryReminders | null | undefined,
  now = Date.now(),
): boolean {
  if (!state?.lastRemindedAt) return true;
  if (levelRank(band.level) > levelRank(state.lastLevel)) return true;
  const elapsedDays = (now - new Date(state.lastRemindedAt).getTime()) / 864e5;
  return elapsedDays >= band.minIntervalDays - 0.01;
}

export async function getOrgSettings(): Promise<Record<string, unknown>> {
  const org = await db.from("organisations").first<Organisations>();
  return (org?.settings as Record<string, unknown> | null) ?? {};
}

export async function blockRotaOnExpiredMandatory(): Promise<boolean> {
  const settings = await getOrgSettings();
  return settings.blockRotaOnExpiredMandatory === true;
}

/** Latest verified (non-superseded) staff compliance doc for a requirement. */
export function latestStaffDoc(
  docs: ComplianceDocuments[],
  staffId: number,
  key: string,
): ComplianceDocuments | undefined {
  return docs
    .filter((d) =>
      Number(d.ownerId) === staffId
      && d.requirementKey === key
      && d.status !== "superseded"
      && d.status !== "cancelled")
    .sort((a, b) => Number(b.id) - Number(a.id))[0];
}

export async function staffMandatoryDocsOk(staffId: number): Promise<{ ok: boolean; reason?: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const reqKeys = (await db.from("complianceRequirements").many<ComplianceRequirements>())
    .filter((r) => r.appliesTo === "staff" && r.required)
    .map((r) => r.key);
  const keys = reqKeys.length ? reqKeys : [...MANDATORY_ROTA_KEYS];
  const docs = await db.from("complianceDocuments").eq("ownerType", "staff").eq("ownerId", staffId).many<ComplianceDocuments>();
  for (const key of keys) {
    const d = latestStaffDoc(docs, staffId, key);
    if (!d || d.status !== "verified") {
      return { ok: false, reason: `Mandatory document missing: ${key.replaceAll("_", " ")}` };
    }
    if (d.expiresAt && d.expiresAt < today) {
      return { ok: false, reason: `Mandatory document expired: ${key.replaceAll("_", " ")}` };
    }
  }
  return { ok: true };
}

export type ExpiryDashboardItem = {
  id: string;
  subjectType: "compliance" | "training" | "plan_review";
  subjectId: number;
  staffId: number | null;
  staffName: string | null;
  clientId: number | null;
  clientName: string | null;
  label: string;
  documentType: string;
  expiresAt: string;
  daysToExpiry: number;
  rag: Rag;
  status: string;
};

export async function buildExpiryDashboard(filters: {
  staffId?: number;
  documentType?: string;
  rag?: Rag;
  maxDaysToExpiry?: number;
  includePlans?: boolean;
}): Promise<{
  items: ExpiryDashboardItem[];
  counts: { green: number; amber: number; red: number; total: number };
  documentTypes: { key: string; label: string }[];
}> {
  const today = new Date().toISOString().slice(0, 10);
  const staff = await db.from("staffProfiles").isNull("deletedAt").many<StaffProfiles>();
  const staffById = new Map(staff.map((s) => [Number(s.id), s]));
  const reqs = await db.from("complianceRequirements").many<ComplianceRequirements>();
  const reqLabel = new Map(reqs.map((r) => [r.key, r.label]));
  const docs = await db.from("complianceDocuments").eq("ownerType", "staff").many<ComplianceDocuments>();
  const enrolments = await db.from("trainingEnrolments").eq("personType", "staff").many<TrainingEnrolments>();
  const courses = await db.from("trainingCourses").many<TrainingCourses>();
  const courseById = new Map(courses.map((c) => [Number(c.id), c]));

  const items: ExpiryDashboardItem[] = [];

  // One row per staff × requirement (latest non-superseded), when an expiry date exists or missing mandatory.
  const trackedKeys = new Set([
    "dbs_enhanced", "right_to_work", "photo_id", "health_declaration", "driving_docs", "signed_contract",
  ]);
  for (const s of staff) {
    if (filters.staffId && Number(s.id) !== filters.staffId) continue;
    for (const key of trackedKeys) {
      const d = latestStaffDoc(docs, Number(s.id), key);
      const label = reqLabel.get(key) ?? key.replaceAll("_", " ");
      if (!d) {
        if (!MANDATORY_ROTA_KEYS.includes(key as typeof MANDATORY_ROTA_KEYS[number])) continue;
        items.push({
          id: `missing:${s.id}:${key}`,
          subjectType: "compliance",
          subjectId: 0,
          staffId: Number(s.id),
          staffName: s.fullName,
          clientId: null,
          clientName: null,
          label,
          documentType: key,
          expiresAt: today,
          daysToExpiry: -999,
          rag: "red",
          status: "missing",
        });
        continue;
      }
      if (!d.expiresAt && d.status === "verified") continue; // no expiry tracked
      const exp = d.expiresAt ?? today;
      const days = d.expiresAt ? daysUntil(d.expiresAt, today) : -999;
      const rag: Rag = d.status !== "verified" ? "red" : ragForExpiry(d.expiresAt, today);
      items.push({
        id: `compliance:${d.id}`,
        subjectType: "compliance",
        subjectId: Number(d.id),
        staffId: Number(s.id),
        staffName: s.fullName,
        clientId: null,
        clientName: null,
        label,
        documentType: key,
        expiresAt: exp,
        daysToExpiry: days,
        rag,
        status: d.status,
      });
    }
  }

  for (const e of enrolments) {
    if (!e.expiresAt) continue;
    if (filters.staffId && Number(e.personId) !== filters.staffId) continue;
    const course = courseById.get(Number(e.courseId));
    const s = staffById.get(Number(e.personId));
    const days = daysUntil(e.expiresAt, today);
    const rag: Rag = e.status !== "completed" ? "red" : ragForExpiry(e.expiresAt, today);
    items.push({
      id: `training:${e.id}`,
      subjectType: "training",
      subjectId: Number(e.id),
      staffId: Number(e.personId),
      staffName: s?.fullName ?? null,
      clientId: null,
      clientName: null,
      label: course?.title ?? `Course #${e.courseId}`,
      documentType: `training:${e.courseId}`,
      expiresAt: e.expiresAt,
      daysToExpiry: days,
      rag,
      status: e.status,
    });
  }

  if (filters.includePlans !== false) {
    const reviews = await db.from("planReviews").notIn("status", ["completed", "cancelled"]).many<PlanReviews>();
    const clients = await db.from("clients").many<Clients>();
    const clientById = new Map(clients.map((c) => [Number(c.id), c]));
    for (const r of reviews) {
      const days = daysUntil(r.dueDate, today);
      const rag: Rag = days < 0 || r.status === "overdue" ? "red" : days <= AMBER_DAYS ? "amber" : "green";
      const client = r.clientId != null ? clientById.get(Number(r.clientId)) : undefined;
      items.push({
        id: `plan_review:${r.id}`,
        subjectType: "plan_review",
        subjectId: Number(r.id),
        staffId: null,
        staffName: null,
        clientId: r.clientId != null ? Number(r.clientId) : null,
        clientName: client ? `${client.firstName} ${client.lastName}` : null,
        label: `${r.planType === "support" ? "Support" : "Care"} plan review`,
        documentType: `plan_${r.planType}`,
        expiresAt: r.dueDate,
        daysToExpiry: days,
        rag,
        status: r.status,
      });
    }
  }

  let filtered = items;
  if (filters.documentType) {
    filtered = filtered.filter((i) =>
      i.documentType === filters.documentType
      || i.documentType.startsWith(`${filters.documentType}:`)
      || (filters.documentType === "plan" && i.subjectType === "plan_review"));
  }
  if (filters.rag) filtered = filtered.filter((i) => i.rag === filters.rag);
  if (filters.maxDaysToExpiry != null) {
    filtered = filtered.filter((i) => i.daysToExpiry <= filters.maxDaysToExpiry!);
  }

  filtered.sort((a, b) => a.daysToExpiry - b.daysToExpiry || (a.staffName ?? "").localeCompare(b.staffName ?? ""));

  const counts = {
    green: filtered.filter((i) => i.rag === "green").length,
    amber: filtered.filter((i) => i.rag === "amber").length,
    red: filtered.filter((i) => i.rag === "red").length,
    total: filtered.length,
  };

  const documentTypes = [
    ...reqs.filter((r) => trackedKeys.has(r.key)).map((r) => ({ key: r.key, label: r.label })),
    { key: "plan", label: "Care / support plan reviews" },
    ...courses.filter((c) => c.mandatory).slice(0, 8).map((c) => ({ key: `training:${c.id}`, label: c.title })),
  ];

  return { items: filtered, counts, documentTypes };
}

async function loadReminderState(subjectType: string, subjectId: number) {
  return db.from("documentExpiryReminders")
    .eq("subjectType", subjectType)
    .eq("subjectId", subjectId)
    .first<DocumentExpiryReminders>();
}

async function markReminded(subjectType: string, subjectId: number, level: string) {
  const existing = await loadReminderState(subjectType, subjectId);
  const now = new Date().toISOString();
  if (existing) {
    await db.from("documentExpiryReminders").eq("id", existing.id).update({
      lastRemindedAt: now,
      lastLevel: level,
      reminderCount: (existing.reminderCount ?? 0) + 1,
      updatedAt: now,
    });
  } else {
    await db.from("documentExpiryReminders").insert({
      subjectType,
      subjectId,
      lastRemindedAt: now,
      lastLevel: level,
      reminderCount: 1,
    });
  }
}

export async function clearReminderState(subjectType: string, subjectId: number) {
  const existing = await loadReminderState(subjectType, subjectId);
  if (existing) await db.from("documentExpiryReminders").eq("id", existing.id).delete();
}

async function markAutomation(key: string, status: string, error?: string) {
  await db.from("automationRules").eq("key", key).update({
    lastRunAt: new Date().toISOString(),
    lastStatus: status,
    lastError: error ?? null,
  }).catch(() => {});
}

/** Daily job: escalating compliance/training + plan review reminders. */
export async function runExpiryReminderJob(): Promise<{
  complianceReminders: number;
  trainingReminders: number;
  planReminders: number;
  plansMarkedOverdue: number;
}> {
  const today = new Date().toISOString().slice(0, 10);
  let complianceReminders = 0;
  let trainingReminders = 0;
  let planReminders = 0;
  let plansMarkedOverdue = 0;

  if (await ruleEnabled("expiry_alerts")) {
    try {
      const staff = await db.from("staffProfiles").isNull("deletedAt").many<StaffProfiles>();
      const staffById = new Map(staff.map((s) => [Number(s.id), s]));
      const reqs = await db.from("complianceRequirements").many<ComplianceRequirements>();
      const reqLabel = new Map(reqs.map((r) => [r.key, r.label]));
      const docs = await db.from("complianceDocuments")
        .eq("ownerType", "staff")
        .eq("status", "verified")
        .many<ComplianceDocuments>();

      for (const d of docs) {
        if (!d.expiresAt) continue;
        const days = daysUntil(d.expiresAt, today);
        const band = reminderBand(days);
        if (!band) continue;
        const state = await loadReminderState("compliance", Number(d.id));
        if (!shouldSendReminder(band, state)) continue;

        const carer = staffById.get(Number(d.ownerId));
        const label = reqLabel.get(d.requirementKey) ?? d.requirementKey.replaceAll("_", " ");
        const when = days < 0
          ? `EXPIRED ${Math.abs(days)} day(s) ago`
          : `expires in ${days} day(s) (${d.expiresAt})`;
        const title = days < 0
          ? `${label} has expired`
          : `${label} expiring soon`;
        const body = carer
          ? `${carer.fullName}: ${label} ${when}. Please renew and upload the updated document.`
          : `${label} ${when}.`;
        const link = carer ? `/staff/${carer.id}` : "/staff/expiry";

        if (carer) {
          await notify({
            staffId: Number(carer.id),
            type: "expiry_alert",
            title,
            body: `Your ${label} ${when}. Please arrange renewal so you stay compliant.`,
            link: `/staff/${carer.id}`,
          });
        }
        await notifyRoles([...EXPIRY_MANAGER_ROLES], {
          type: "expiry_alert",
          title,
          body,
          link,
        });
        await markReminded("compliance", Number(d.id), band.level);
        complianceReminders++;
      }

      const enrolments = await db.from("trainingEnrolments")
        .eq("personType", "staff")
        .eq("status", "completed")
        .many<TrainingEnrolments>();
      const courses = await db.from("trainingCourses").many<TrainingCourses>();
      const courseById = new Map(courses.map((c) => [Number(c.id), c]));

      for (const e of enrolments) {
        if (!e.expiresAt) continue;
        const days = daysUntil(e.expiresAt, today);
        const band = reminderBand(days);
        if (!band) continue;
        const state = await loadReminderState("training", Number(e.id));
        if (!shouldSendReminder(band, state)) continue;
        const course = courseById.get(Number(e.courseId));
        const carer = staffById.get(Number(e.personId));
        const label = course?.title ?? "Training";
        const when = days < 0 ? `EXPIRED ${Math.abs(days)} day(s) ago` : `expires in ${days} day(s)`;
        const title = days < 0 ? `${label} has expired` : `${label} renewing soon`;
        if (carer) {
          await notify({
            staffId: Number(carer.id),
            type: "expiry_alert",
            title,
            body: `Your ${label} ${when}. Book a refresher if needed.`,
            link: "/me",
          });
        }
        await notifyRoles([...EXPIRY_MANAGER_ROLES], {
          type: "expiry_alert",
          title,
          body: `${carer?.fullName ?? "Staff"}: ${label} ${when}.`,
          link: carer ? `/staff/${carer.id}` : "/staff/expiry",
        });
        await markReminded("training", Number(e.id), band.level);
        trainingReminders++;
      }

      await markAutomation("expiry_alerts", "ok");
    } catch (err) {
      await markAutomation("expiry_alerts", "error", err instanceof Error ? err.message : "failed");
      throw err;
    }
  }

  if (await ruleEnabled("plan_review_alerts")) {
    try {
      const open = await db.from("planReviews").notIn("status", ["completed", "cancelled"]).many<PlanReviews>();
      const clients = await db.from("clients").many<Clients>();
      const clientById = new Map(clients.map((c) => [Number(c.id), c]));
      const plans = await db.from("carePlans").many<CarePlans>();
      const planById = new Map(plans.map((p) => [Number(p.id), p]));

      for (const r of open) {
        if (r.dueDate < today && r.status !== "overdue") {
          await db.from("planReviews").eq("id", r.id).update({ status: "overdue" });
          plansMarkedOverdue++;
          r.status = "overdue";
        }
        const days = daysUntil(r.dueDate, today);
        const band = reminderBand(days);
        // Plan reviews: start reminders at 30 days (skip the 60-day band).
        if (!band || band.level === "60") continue;
        const state = await loadReminderState("plan_review", Number(r.id));
        if (!shouldSendReminder(band, state)) continue;

        const client = r.clientId != null ? clientById.get(Number(r.clientId)) : undefined;
        const plan = planById.get(Number(r.planId));
        const kind = (plan?.planType ?? r.planType) === "support" ? "Support" : "Care";
        const who = client ? `${client.firstName} ${client.lastName}` : `Client #${r.clientId ?? "?"}`;
        const when = days < 0
          ? `OVERDUE by ${Math.abs(days)} day(s)`
          : `due in ${days} day(s) (${r.dueDate})`;
        await notifyRoles([...PLAN_REVIEW_ALERT_ROLES], {
          type: "plan_review_alert",
          title: `${kind} plan review ${days < 0 ? "overdue" : "due soon"}`,
          body: `${who}: ${kind.toLowerCase()} plan review ${when}.`,
          link: "/cqc/plan-reviews",
        });
        await markReminded("plan_review", Number(r.id), band.level);
        planReminders++;
      }

      await markAutomation("plan_review_alerts", "ok");
    } catch (err) {
      await markAutomation("plan_review_alerts", "error", err instanceof Error ? err.message : "failed");
      throw err;
    }
  }

  await audit("System", "expiry_reminders_run", "automation_rules", undefined, {
    complianceReminders, trainingReminders, planReminders, plansMarkedOverdue,
  });

  return { complianceReminders, trainingReminders, planReminders, plansMarkedOverdue };
}
