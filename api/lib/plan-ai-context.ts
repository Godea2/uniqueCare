import { db } from "../db";
import type { ClientPreferences, Clients, VisitTemplates } from "@db/schema";
import {
  CARE_PLAN_ASSESSMENT_SECTIONS,
  emptyCarePlanAssessmentContent,
  type CarePlanAssessmentContent,
} from "@contracts/care-plan-assessment";
import {
  SUPPORT_PLAN_SECTIONS,
  emptySupportPlanContent,
  type SupportPlanContent,
} from "@contracts/support-plan";

export type ClientPlanContext = {
  clientRef: string;
  fullName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  address: string;
  accessNotes: string | null;
  gpDetails: string | null;
  nextOfKin: unknown;
  fundingSource: string;
  riskLevel: string;
  startDate: string | null;
  timeCritical: boolean;
  preferredCarerGender: string | null;
  preferredLanguage: string | null;
  petsInHome: boolean | null;
  smokingInHome: boolean | null;
  culturalReligiousNotes: string | null;
  communicationNeeds: string | null;
  preferenceOtherNotes: string | null;
  visitPatternSummary: string[];
};

/** Live client + preferences + visit pattern for AI plan drafting. */
export async function loadClientPlanContext(clientId: number): Promise<ClientPlanContext | null> {
  const client = await db.from("clients").eq("id", clientId).isNull("deletedAt").first<Clients>();
  if (!client) return null;
  const pref = await db.from("clientPreferences").eq("clientId", clientId).first<ClientPreferences>() ?? null;
  const templates = await db.from("visitTemplates").eq("clientId", clientId).many<VisitTemplates>();
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const visitPatternSummary = templates.map((t) => {
    const day = dayNames[t.dayOfWeek] ?? `day ${t.dayOfWeek}`;
    return `${day} ${t.startTime} · ${t.durationMinutes} min · ${t.visitType} · ${t.callType === "double" ? "2 carers" : "1 carer"}`;
  });

  const address = [client.addressLine1, client.town, client.postcode].filter(Boolean).join(", ");

  return {
    clientRef: client.clientRef,
    fullName: `${client.firstName} ${client.lastName}`,
    preferredName: client.preferredName,
    dateOfBirth: client.dob,
    gender: client.gender,
    phone: client.phone,
    address,
    accessNotes: client.accessNotes,
    gpDetails: client.gpDetails,
    nextOfKin: client.nextOfKin,
    fundingSource: client.fundingSource,
    riskLevel: client.riskLevel,
    startDate: client.startDate,
    timeCritical: !!client.timeCritical,
    preferredCarerGender: pref?.preferredGender ?? null,
    preferredLanguage: pref?.preferredLanguage ?? null,
    petsInHome: pref?.petsInHome ?? null,
    smokingInHome: pref?.smokingInHome ?? null,
    culturalReligiousNotes: pref?.culturalReligiousNotes ?? null,
    communicationNeeds: pref?.communicationNeeds ?? null,
    preferenceOtherNotes: pref?.otherNotes ?? null,
    visitPatternSummary,
  };
}

/** Human-readable facts block for the AI prompt — only known values. */
export function formatClientContextForAi(ctx: ClientPlanContext): string {
  const lines: string[] = [
    `Client ref: ${ctx.clientRef}`,
    `Name: ${ctx.fullName}${ctx.preferredName ? ` (preferred: ${ctx.preferredName})` : ""}`,
  ];
  if (ctx.dateOfBirth) lines.push(`Date of birth: ${ctx.dateOfBirth}`);
  if (ctx.gender) lines.push(`Gender: ${ctx.gender}`);
  if (ctx.phone) lines.push(`Phone: ${ctx.phone}`);
  if (ctx.address) lines.push(`Address: ${ctx.address}`);
  if (ctx.accessNotes) lines.push(`Access notes: ${ctx.accessNotes}`);
  if (ctx.gpDetails) lines.push(`GP details: ${ctx.gpDetails}`);
  if (ctx.nextOfKin) lines.push(`Next of kin / key contacts: ${JSON.stringify(ctx.nextOfKin)}`);
  lines.push(`Funding: ${ctx.fundingSource.replace(/_/g, " ")}`);
  lines.push(`Risk level: ${ctx.riskLevel}`);
  if (ctx.startDate) lines.push(`Care start date: ${ctx.startDate}`);
  if (ctx.timeCritical) lines.push("Time-critical / medication client: yes (±30 min visit window)");
  if (ctx.preferredCarerGender) lines.push(`Preferred carer gender: ${ctx.preferredCarerGender}`);
  if (ctx.preferredLanguage) lines.push(`Preferred language: ${ctx.preferredLanguage}`);
  if (ctx.petsInHome != null) lines.push(`Pets in home: ${ctx.petsInHome ? "yes" : "no"}`);
  if (ctx.smokingInHome != null) lines.push(`Smoking in home: ${ctx.smokingInHome ? "yes" : "no"}`);
  if (ctx.culturalReligiousNotes) lines.push(`Cultural / religious needs: ${ctx.culturalReligiousNotes}`);
  if (ctx.communicationNeeds) lines.push(`Communication needs: ${ctx.communicationNeeds}`);
  if (ctx.preferenceOtherNotes) lines.push(`Other preference notes: ${ctx.preferenceOtherNotes}`);
  if (ctx.visitPatternSummary.length) {
    lines.push("Regular visit pattern (from live rota templates):");
    for (const v of ctx.visitPatternSummary) lines.push(`  - ${v}`);
  }
  return lines.join("\n");
}

const MISSING = "⚠ Information needed";

function setIfEmpty(obj: Record<string, unknown>, key: string, value: string | null | undefined) {
  if (value == null || String(value).trim() === "") return;
  const cur = obj[key];
  if (cur == null || cur === "" || (typeof cur === "string" && cur.startsWith(MISSING))) {
    obj[key] = value;
  }
}

/**
 * Pre-fill structured care-plan fields from the live client record.
 * Only writes known facts — never invents.
 */
export function seedCarePlanFromClient(ctx: ClientPlanContext): CarePlanAssessmentContent {
  const content = emptyCarePlanAssessmentContent();

  const individual = content.individual_information as Record<string, unknown>;
  setIfEmpty(individual, "careStartDate", ctx.startDate);
  setIfEmpty(individual, "sexGender", mapGender(ctx.gender));
  setIfEmpty(individual, "preferredCarerGender", mapCarerGender(ctx.preferredCarerGender));
  if (ctx.petsInHome != null) {
    setIfEmpty(individual, "pets", ctx.petsInHome ? "Yes — see preference notes / ask for details" : "No pets recorded");
  }
  if (ctx.culturalReligiousNotes) setIfEmpty(individual, "faith", ctx.culturalReligiousNotes);

  const contacts = content.personal_details_contacts as Record<string, unknown>;
  setIfEmpty(contacts, "address", ctx.address || null);
  setIfEmpty(contacts, "phone", ctx.phone);
  setIfEmpty(contacts, "dateOfBirth", ctx.dateOfBirth);
  setIfEmpty(contacts, "gpNameSurgery", ctx.gpDetails);
  const nok = formatNextOfKin(ctx.nextOfKin);
  if (nok) {
    setIfEmpty(contacts, "lpaName", nok.name);
    setIfEmpty(contacts, "lpaPhone", nok.phone);
    setIfEmpty(contacts, "lpaRelationship", nok.relationship);
  }

  const property = content.property_utilities as Record<string, unknown>;
  setIfEmpty(property, "accessNotes", ctx.accessNotes);

  const medical = content.medical_information as Record<string, unknown>;
  if (ctx.smokingInHome != null) {
    setIfEmpty(medical, "smoking", ctx.smokingInHome ? "Smoking in the home (recorded on client preferences)" : "No smoking in the home (recorded)");
  }

  const health = content.general_health_needs as Record<string, unknown>;
  setIfEmpty(health, "communication", ctx.communicationNeeds);

  const social = content.social_activities as Record<string, unknown>;
  setIfEmpty(social, "culturalNeeds", ctx.culturalReligiousNotes);

  // Seed visit schedule days/times from templates where we can map roughly
  seedVisitsFromTemplates(content.visit_schedule as { visits?: Array<Record<string, string>> }, ctx);

  return content;
}

export function seedSupportPlanFromClient(ctx: ClientPlanContext): SupportPlanContent {
  const content = emptySupportPlanContent();
  const about = content.about_me as Record<string, unknown>;
  setIfEmpty(about, "whoIAm", `${ctx.fullName}${ctx.preferredName ? ` (likes to be called ${ctx.preferredName})` : ""} — ${ctx.clientRef}`);
  setIfEmpty(about, "communication", ctx.communicationNeeds);

  const community = content.community_relationships as Record<string, unknown>;
  setIfEmpty(community, "faithCulture", ctx.culturalReligiousNotes);
  const nok = formatNextOfKin(ctx.nextOfKin);
  if (nok?.name) setIfEmpty(community, "importantPeople", `${nok.name}${nok.relationship ? ` (${nok.relationship})` : ""}${nok.phone ? ` — ${nok.phone}` : ""}`);

  const wellbeing = content.health_wellbeing as Record<string, unknown>;
  if (ctx.riskLevel) setIfEmpty(wellbeing, "escalate", `Recorded risk level: ${ctx.riskLevel}. Escalate per service policy.`);

  seedVisitsFromTemplates(content.support_visits as { visits?: Array<Record<string, string>> }, ctx);

  return content;
}

function seedVisitsFromTemplates(
  section: { visits?: Array<Record<string, string>> } | undefined,
  ctx: ClientPlanContext,
) {
  if (!section?.visits?.length || !ctx.visitPatternSummary.length) return;
  // Best-effort: put a combined summary into the "other" slot tasks if mornings empty
  const other = section.visits.find((v) => v.slot === "other");
  if (other && !other.tasks) {
    other.tasks = `Live rota templates:\n${ctx.visitPatternSummary.join("\n")}`;
    other.careNeeds = "Map each template into the correct morning/lunch/tea/bed row and confirm with the assessor.";
  }
}

function mapGender(g: string | null): string | null {
  if (!g) return null;
  const x = g.toLowerCase();
  if (x.startsWith("f")) return "female";
  if (x.startsWith("m")) return "male";
  return "other";
}

function mapCarerGender(g: string | null): string | null {
  if (!g) return null;
  const x = g.toLowerCase();
  if (x === "any" || x === "no_preference" || x === "none") return "no_preference";
  if (x.startsWith("f")) return "female";
  if (x.startsWith("m")) return "male";
  return "no_preference";
}

function formatNextOfKin(nok: unknown): { name?: string; phone?: string; relationship?: string } | null {
  if (!nok) return null;
  if (typeof nok === "string") return { name: nok };
  if (typeof nok === "object") {
    const o = nok as Record<string, unknown>;
    return {
      name: (o.name ?? o.fullName ?? o.full_name) as string | undefined,
      phone: (o.phone ?? o.mobile ?? o.tel) as string | undefined,
      relationship: (o.relationship ?? o.relation) as string | undefined,
    };
  }
  return null;
}

/** Section guide lines for the AI — title + guidance + field keys. */
export function buildSectionGuide(
  kind: "care" | "support",
): string {
  const sections = kind === "care" ? CARE_PLAN_ASSESSMENT_SECTIONS : SUPPORT_PLAN_SECTIONS;
  return sections
    .filter((s) => s.layout === "fields")
    .map((s) => {
      const fields = (s.fields ?? []).map((f) => `    - ${f.key}: ${f.label}${f.help ? ` (${f.help})` : ""}`).join("\n");
      return `## ${s.key} — ${s.title}\nGuidance: ${s.guidance ?? "Write what an assessor would expect under this heading."}\nFields:\n${fields}`;
    })
    .join("\n\n");
}

export function mergeStructuredSections(
  base: CarePlanAssessmentContent | SupportPlanContent,
  aiSections: Record<string, Record<string, string>>,
  allowedKeys: Set<string>,
): CarePlanAssessmentContent | SupportPlanContent {
  const out = { ...base };
  for (const [secKey, fields] of Object.entries(aiSections)) {
    if (!allowedKeys.has(secKey)) continue;
    if (!out[secKey] || typeof out[secKey] !== "object") continue;
    const merged = { ...(out[secKey] as Record<string, unknown>) };
    for (const [fk, fv] of Object.entries(fields)) {
      if (typeof fv !== "string") continue;
      const existing = merged[fk];
      // Keep seeded live facts; don't let AI blank them with missing placeholders if we already have real data
      if (
        typeof existing === "string" &&
        existing.trim() &&
        !existing.startsWith(MISSING) &&
        fv.startsWith(MISSING)
      ) {
        continue;
      }
      // Don't overwrite a good seeded value with a weaker AI paraphrase of the same fact unless AI has more detail
      if (
        typeof existing === "string" &&
        existing.trim() &&
        !existing.startsWith(MISSING) &&
        fv.trim().length < existing.trim().length &&
        !fv.startsWith(MISSING)
      ) {
        // allow AI if substantially different / richer — keep longer existing if AI is shorter
        continue;
      }
      merged[fk] = fv;
    }
    out[secKey] = merged;
  }
  return out;
}
