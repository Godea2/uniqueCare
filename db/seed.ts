import { db } from "../api/db";
import type {
  ApplicationStage,
  ClientAssignedWorkers,
  Clients,
  DocumentTemplates,
  StaffProfiles,
  StaffRole,
  VisitTemplates,
} from "./schema";
import { defaultCareWorkerForm } from "../contracts/form-schema";

// Deterministic PRNG so re-seeds are stable
let _seed = 42;
function rnd() {
  _seed |= 0;
  _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const pickN = <T,>(arr: readonly T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  return out;
};
const ri = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const pad = (n: number) => String(n).padStart(2, "0");
const token = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

function mondayOfCurrentWeek(): Date {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 0=Mon
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
const dateStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dt = (d: Date, time: string) => new Date(`${dateStr(d)}T${time}:00`);

const FIRST_F = ["Mary","Patricia","Linda","Barbara","Elizabeth","Jennifer","Susan","Margaret","Dorothy","Lisa","Nancy","Karen","Betty","Sandra","Carol","Amara","Funmi","Chioma","Blessing","Grace","Fatima","Aisha","Zainab","Halima","Priya","Anita","Sunita","Kiran","Manpreet","Rose","Vera","Edith","Agnes","Ethel","Gladys","Ivy","Olive","Mabel","Florence","Beatrice"];
const FIRST_M = ["John","Robert","Michael","David","William","Richard","Thomas","Charles","George","James","Tunde","Emeka","Chidi","Ade","Kwame","Kofi","Raj","Sanjay","Vikram","Harpreet","Peter","Paul","Andrew","Kenneth","Arthur","Albert","Harold","Stanley","Ronald","Derek"];
const LAST = ["Smith","Jones","Williams","Brown","Taylor","Davies","Evans","Wilson","Thomas","Roberts","Johnson","Walker","Robinson","Thompson","White","Hughes","Edwards","Green","Hall","Wood","Harris","Lewis","Martin","Jackson","Clarke","Clark","Turner","Hill","Moore","Cooper","Ward","Morris","King","Baker","Young","Allen","Morgan","Bell","Murphy","Bailey","Okafor","Adebayo","Osei","Mensah","Kaur","Singh","Patel","Shah","Ali","Khan"];
const SKILLS = ["hoist","peg_feeding","catheter_care","dementia","end_of_life","medication_level_2","parkinsons","diabetes_care","stoma_care","epilepsy_buccal"];
const POSTCODES: { pc: string; lat: number; lng: number; town: string }[] = [
  { pc: "B23 6AA", lat: 52.524, lng: -1.842, town: "Erdington" },
  { pc: "B24 8HF", lat: 52.511, lng: -1.827, town: "Erdington" },
  { pc: "B25 8DY", lat: 52.461, lng: -1.842, town: "Yardley" },
  { pc: "B26 3QX", lat: 52.449, lng: -1.814, town: "Sheldon" },
  { pc: "B33 0TH", lat: 52.477, lng: -1.786, town: "Stechnford" },
  { pc: "B34 7AG", lat: 52.496, lng: -1.764, town: "Shard End" },
];

async function seed() {
  const existing = await db.from("organisations").limit(1).many();
  if (existing.length > 0) {
    console.log("Database already seeded — skipping.");
    process.exit(0);
  }
  console.log("Seeding UniqueCare Connect…");

  // ── Organisation ──
  await db.from("organisations").insert<{ id: number }>({
    name: "Unique Care UK",
    cqcLocationId: "1-1234567890",
    address: "Suite 4, High Street, Erdington, Birmingham B23 6RY",
    logoUrl: "/logo.png",
    settings: {
      timezone: "Europe/London",
      screeningThreshold: 85,
      planReviewMonths: 12,
      businessHours: { start: "08:00", end: "18:00" },
    },
  });

  // ── Compliance requirements ──
  const complianceReqs = [
    ["dbs_enhanced", "Enhanced DBS with adult barred list", 36],
    ["right_to_work", "Right to work check", null],
    ["photo_id", "Photo ID", null],
    ["proof_of_address", "Proof of address (under 3 months old)", null],
    ["reference_1", "Reference — most recent care employer", null],
    ["reference_2", "Reference — second referee", null],
    ["employment_history", "Full employment history with gaps explained", null],
    ["qualifications", "Qualifications / certificates", null],
    ["health_declaration", "Health declaration", 12],
    ["signed_contract", "Signed contract", null],
    ["bank_details", "Bank details for payroll", null],
    ["driving_docs", "Driving licence + business insurance (drivers)", 12],
  ] as const;
  for (const [key, label, months] of complianceReqs) {
    await db.from("complianceRequirements").insert<{ id: number }>({
      key, label, appliesTo: "candidate", required: true, expiresAfterMonths: months ?? null,
    });
  }

  // ── Training courses ──
  const courseTitles: [string, "online" | "classroom", number, number | null][] = [
    ["Care Certificate — Standards 1–15 (theory)", "online", 6, null],
    ["Safeguarding Adults Level 2", "online", 3, 12],
    ["Moving & Handling (theory)", "online", 2, 12],
    ["Moving & Handling (practical)", "classroom", 4, 12],
    ["Infection Prevention & Control", "online", 2, 12],
    ["Basic Life Support (theory)", "online", 2, 12],
    ["Medication Awareness & Administration", "online", 3, 24],
    ["Fire Safety", "online", 1.5, 12],
    ["Food Hygiene Level 2", "online", 2, 36],
    ["Information Governance / GDPR", "online", 1.5, 12],
    ["Mental Capacity Act & DoLS", "online", 2, 24],
    ["Dementia Awareness", "online", 2, 24],
    ["Equality, Diversity & Inclusion", "online", 1.5, 24],
    ["Health & Safety at Work", "online", 2, 12],
  ];
  const courseIds: number[] = [];
  for (const [title, type, hours, renew] of courseTitles) {
    const [r] = await db.from("trainingCourses").insert<{ id: number }>({
      title, type, provider: "Unique Care Academy", durationHours: String(hours),
      mandatory: true, renewEveryMonths: renew,
    });
    courseIds.push(r.id);
  }
  // Classroom sessions (next 3 Mondays)
  const mon = mondayOfCurrentWeek();
  const sessionIds: number[] = [];
  const classroomCourse = courseIds[3]; // Moving & Handling practical
  for (let w = 0; w < 3; w++) {
    const d = new Date(mon); d.setDate(d.getDate() + w * 7);
    const [r] = await db.from("trainingSessions").insert<{ id: number }>({
      courseId: classroomCourse, startsAt: dt(d, "09:30"), endsAt: dt(d, "13:30"),
      location: "Unique Care UK Training Room, Erdington", capacity: 10, trainerName: "Paul Hendricks",
    });
    sessionIds.push(r.id);
  }

  // ── Document templates ──
  const carePlanStructure = [
    { key: "about_me", title: "About me", required: true, guidance: "Who I am, my story, what matters to me" },
    { key: "important_people", title: "Important people in my life", required: true },
    { key: "health_conditions", title: "My health conditions", required: true },
    { key: "medication_support", title: "Medication support", required: true },
    { key: "mobility", title: "Mobility and moving & handling", required: true },
    { key: "personal_care", title: "Personal care", required: true },
    { key: "nutrition", title: "Nutrition and hydration", required: true },
    { key: "continence", title: "Continence", required: false },
    { key: "skin", title: "Skin integrity", required: false },
    { key: "communication", title: "Communication and sensory needs", required: true },
    { key: "mental_health", title: "Mental health, cognition and capacity (MCA)", required: true },
    { key: "social_needs", title: "Social, cultural and spiritual needs", required: false },
    { key: "risks", title: "Risks and how we reduce them", required: true },
    { key: "visit_schedule", title: "My visit schedule and tasks", required: true },
    { key: "outcomes", title: "My outcomes and goals", required: true },
    { key: "consent", title: "Consent", required: true },
    { key: "review_date", title: "Review date", required: true },
  ];
  const supportPlanStructure = [
    { key: "outcomes", title: "Outcomes I want to achieve", required: true },
    { key: "how_supported", title: "How I want to be supported", required: true },
    { key: "working", title: "What's working / not working", required: true },
    { key: "independence", title: "Independence and daily living", required: true },
    { key: "community", title: "Community and relationships", required: false },
    { key: "positive_risk", title: "Risks I choose to take (positive risk-taking)", required: true },
    { key: "contingency", title: "Contingency plans", required: true },
    { key: "review", title: "Review", required: true },
  ];
  const supNoteStructure = [
    { key: "staff_member", title: "Staff member", required: true },
    { key: "date_type", title: "Date and type", required: true },
    { key: "client_visit", title: "Client / visit (optional)", required: false },
    { key: "safe", title: "Safe — observations", required: true },
    { key: "effective", title: "Effective — observations", required: true },
    { key: "caring", title: "Caring — observations", required: true },
    { key: "responsive", title: "Responsive — observations", required: false },
    { key: "well_led", title: "Well-led — observations", required: false },
    { key: "strengths", title: "Strengths", required: true },
    { key: "develop", title: "Areas to develop", required: true },
    { key: "actions", title: "Agreed actions and due dates", required: true },
    { key: "staff_comments", title: "Staff comments", required: false },
  ];
  await db.from("documentTemplates").insert<{ id: number }>([
    { kind: "care_plan", version: 1, name: "Care plan (standard)", structure: carePlanStructure, active: true },
    { kind: "support_plan", version: 1, name: "Support plan (person-centred)", structure: supportPlanStructure, active: true },
    { kind: "supervisor_note", version: 1, name: "Supervisor note (CQC key questions)", structure: supNoteStructure, active: true },
    { kind: "offer_letter", version: 1, name: "Offer of employment — care worker", structure: [
      { key: "role", title: "Role and start date" }, { key: "pay", title: "Pay and hours" }, { key: "terms", title: "Terms" },
    ], active: true },
    { kind: "appraisal", version: 1, name: "Annual appraisal", structure: [
      { key: "summary", title: "Summary of the year" }, { key: "strengths", title: "Strengths" },
      { key: "development", title: "Development areas" }, { key: "objectives", title: "Objectives for next year" },
    ], active: true },
  ]);

  // ── SLA policies ──
  await db.from("slaPolicies").insert<{ id: number }>([
    { name: "Urgent", priority: "urgent", firstResponseMinutes: 30, resolutionMinutes: 120 },
    { name: "High", priority: "high", firstResponseMinutes: 60, resolutionMinutes: 480 },
    { name: "Normal", priority: "normal", firstResponseMinutes: 240, resolutionMinutes: 1440 },
    { name: "Low", priority: "low", firstResponseMinutes: 1440, resolutionMinutes: 4320 },
  ]);

  // ── Staff profiles ──
  const coreTeam: [string, string, StaffRole, string][] = [
    ["Ruby", "Osei", "super_admin", "Registered Manager"],
    ["Daniel", "Whitfield", "admin", "Office & HR Administrator"],
    ["Sofia", "Marsh", "care_coordinator", "Care Coordinator"],
    ["Ngozi", "Eze", "team_leader", "Team Leader"],
    ["Marcus", "Field", "supervisor", "Field Supervisor"],
    ["Helen", "Brooks", "interview_panel", "Interview Panel Member"],
    ["Tanya", "Reid", "crm_agent", "Office & Call Handler"],
  ];
  const staffIds: number[] = [];
  for (const [fn, ln, role, job] of coreTeam) {
    const [r] = await db.from("staffProfiles").insert<{ id: number }>({
      fullName: `${fn} ${ln}`, email: `${fn.toLowerCase()}@uniquecareuk.co.uk`,
      phone: `07700 90${ri(1000, 9999)}`, role, jobTitle: job, employeeNo: `UC${pad(staffIds.length + 1).padStart(3, "0")}`,
      startDate: "2023-01-09", employmentType: "full_time", contractedHours: "37.5",
      homePostcode: pick(POSTCODES).pc, gender: pick(["female", "male"]),
      languages: ["English"], skills: SKILLS.slice(0, ri(3, 6)), status: "active",
      avatarColor: pick(["#1477AE", "#0A2E5C", "#278EBD", "#0F6FA3"]),
    });
    staffIds.push(r.id);
  }
  // 30 care workers
  const cwIds: number[] = [];
  for (let i = 0; i < 30; i++) {
    const female = rnd() < 0.72;
    const fn = female ? pick(FIRST_F) : pick(FIRST_M);
    const ln = pick(LAST);
    const home = pick(POSTCODES);
    const [r] = await db.from("staffProfiles").insert<{ id: number }>({
      fullName: `${fn} ${ln}`, email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@uniquecareuk.co.uk`,
      phone: `07700 91${ri(1000, 9999)}`, role: "care_worker", jobTitle: "Care Worker",
      employeeNo: `UC${String(staffIds.length + 1).padStart(3, "0")}`,
      startDate: `202${ri(2, 5)}-${pad(ri(1, 12))}-${pad(ri(1, 28))}`,
      employmentType: pick(["full_time", "full_time", "part_time", "zero_hours"]),
      contractedHours: pick(["37.5", "30", "22.5", "0"]),
      maxWeeklyHours: "48", homePostcode: home.pc, lat: String(home.lat + (rnd() - 0.5) * 0.02),
      lng: String(home.lng + (rnd() - 0.5) * 0.02), drives: rnd() < 0.55, hasVehicle: rnd() < 0.5,
      gender: female ? "female" : "male",
      languages: pick([["English"], ["English"], ["English", "Polish"], ["English", "Urdu"], ["English", "Yoruba"]]),
      skills: pickN(SKILLS, ri(2, 5)), status: i < 27 ? "active" : "onboarding",
      avatarColor: pick(["#1477AE", "#0A2E5C", "#278EBD", "#0F6FA3", "#155A9C"]),
    });
    const id = r.id;
    staffIds.push(id); cwIds.push(id);
    // availability: most weekdays, some weekends
    const days = pickN([0, 1, 2, 3, 4, 5, 6], ri(4, 6));
    for (const d of days) {
      const early = rnd() < 0.5;
      await db.from("staffAvailability").insert<{ id: number }>({
        staffId: id, dayOfWeek: d, startTime: early ? "07:00" : "12:00", endTime: early ? "15:00" : "22:00",
      });
    }
  }
  const activeCw = cwIds.slice(0, 27);

  // ── Teams ──
  const teamDefs: [string, number, number[]][] = [
    ["Office", staffIds[6], [staffIds[1], staffIds[6]]],
    ["Rota & Coordination", staffIds[2], [staffIds[2], staffIds[3]]],
    ["HR", staffIds[1], [staffIds[1], staffIds[5]]],
    ["Care Quality", staffIds[3], [staffIds[3], staffIds[4]]],
    ["Management", staffIds[0], [staffIds[0], staffIds[1]]],
  ];
  const teamIds: number[] = [];
  for (const [name, lead, members] of teamDefs) {
    const [r] = await db.from("teams").insert<{ id: number }>({ name, leadId: lead, memberIds: members });
    teamIds.push(r.id);
  }

  // ── Clients ──
  const clientIds: number[] = [];
  const CONDITIONS = [
    "dementia", "diabetes_care", "hoist", "catheter_care", "medication_level_2",
    "parkinsons", "end_of_life", "stoma_care",
  ];
  for (let i = 0; i < 25; i++) {
    const female = rnd() < 0.6;
    const fn = female ? pick(FIRST_F) : pick(FIRST_M);
    const ln = pick(LAST);
    const home = pick(POSTCODES);
    const risk = rnd() < 0.2 ? "high" : rnd() < 0.5 ? "medium" : "low";
    const [r] = await db.from("clients").insert<{ id: number }>({
      clientRef: `UC-C-${String(i + 1).padStart(4, "0")}`,
      firstName: fn, lastName: ln, preferredName: rnd() < 0.3 ? fn : null,
      dob: `19${ri(28, 48)}-${pad(ri(1, 12))}-${pad(ri(1, 28))}`,
      gender: female ? "female" : "male",
      addressLine1: `${ri(2, 180)} ${pick(["Church Road", "High Street", "Station Road", "Grange Avenue", "Marsh Lane", "Queens Road", "Park Avenue", "Mill Lane"])}`,
      town: home.town, postcode: home.pc, lat: String(home.lat + (rnd() - 0.5) * 0.015),
      lng: String(home.lng + (rnd() - 0.5) * 0.015),
      accessNotes: pick([
        "Key safe on the left of the front door. Ring twice.",
        "Side gate entry; family will text the code weekly.",
        "Bungalow — park on the drive. Dog is friendly.",
        "First-floor flat, lift available. Buzz flat 12.",
        "Client hard of hearing — knock loudly and wait.",
      ]),
      phone: `0121 ${ri(200, 999)} ${ri(1000, 9999)}`,
      gpDetails: `${home.town} Medical Centre, Dr ${pick(LAST)}`,
      nextOfKin: { name: `${pick(FIRST_M)} ${ln}`, relationship: pick(["Son", "Daughter", "Nephew"]), phone: `07700 92${ri(1000, 9999)}` },
      fundingSource: pick(["local_authority", "local_authority", "nhs_chc", "private", "mixed"]),
      status: i < 22 ? "active" : i === 22 ? "hospital" : "paused",
      startDate: `202${ri(3, 5)}-${pad(ri(1, 12))}-${pad(ri(1, 28))}`,
      riskLevel: risk,
    });
    const cid = r.id;
    clientIds.push(cid);
    await db.from("clientPreferences").insert<{ id: number }>({
      clientId: cid,
      preferredGender: rnd() < 0.35 ? "female" : "any",
      preferredLanguage: rnd() < 0.12 ? pick(["Urdu", "Polish", "Yoruba"]) : "English",
      petsInHome: rnd() < 0.3, smokingInHome: rnd() < 0.12,
      communicationNeeds: rnd() < 0.25 ? "Speak slowly and face the client; wears hearing aids." : null,
    });
    const reqSkills = pickN(CONDITIONS, ri(1, 2));
    for (const sk of reqSkills) {
      await db.from("clientRequiredSkills").insert<{ id: number }>({ clientId: cid, skill: sk });
    }
    const hours = pick(["7", "10.5", "14", "21", "28"]);
    const [pkg] = await db.from("carePackages").insert<{ id: number }>({
      clientId: cid, effectiveFrom: "2025-01-06", commissionedHoursPerWeek: hours,
      notes: "Commissioned by Birmingham City Council.",
    });
    const pkgId = pkg.id;
    // visit templates spread across the week
    const pattern = pick([
      [[0, "07:30", 60, "personal_care"], [0, "12:00", 45, "meal"], [2, "07:30", 60, "personal_care"], [2, "18:00", 45, "meal"], [4, "07:30", 60, "personal_care"]],
      [[1, "08:00", 60, "personal_care"], [3, "08:00", 60, "personal_care"], [5, "08:00", 60, "personal_care"], [6, "10:00", 45, "welfare_check"]],
      [[0, "09:00", 30, "medication"], [1, "09:00", 30, "medication"], [2, "09:00", 30, "medication"], [3, "09:00", 30, "medication"], [4, "09:00", 30, "medication"], [5, "09:00", 30, "medication"], [6, "09:00", 30, "medication"]],
      [[0, "07:00", 60, "personal_care"], [0, "12:30", 45, "meal"], [0, "17:30", 45, "meal"], [0, "21:00", 45, "sit"], [3, "07:00", 60, "personal_care"], [3, "12:30", 45, "meal"], [3, "17:30", 45, "meal"], [3, "21:00", 45, "sit"]],
    ] as const);
    for (const [dow, time, dur, vtype] of pattern) {
      const isDouble = risk === "high" && vtype === "personal_care" && rnd() < 0.5;
      await db.from("visitTemplates").insert<{ id: number }>({
        carePackageId: pkgId, clientId: cid, dayOfWeek: dow as number,
        startTime: time as string, durationMinutes: dur as number,
        callType: isDouble ? "double" : "single", visitType: vtype as never,
        tasks: ["Follow care plan", "Record visit notes"],
      });
    }
    // assigned workers (primary + backup)
    const assigned = pickN(activeCw, 2);
    for (let a = 0; a < assigned.length; a++) {
      await db.from("clientAssignedWorkers").insert<{ id: number }>({
        clientId: cid, staffId: assigned[a], isPrimary: a === 0,
      });
    }
  }

  // ── Job postings ──
  const jobReqs = [
    { key: "rtw", label: "Right to work in the UK", weight: 20, type: "boolean", required: true },
    { key: "experience", label: "6+ months domiciliary care experience", weight: 25, type: "years", required: false },
    { key: "care_cert", label: "Care Certificate (or willingness to complete)", weight: 15, type: "boolean", required: false },
    { key: "driving", label: "Full UK driving licence", weight: 10, type: "boolean", required: false },
    { key: "vehicle", label: "Access to own vehicle", weight: 10, type: "boolean", required: false },
    { key: "weekends", label: "Available for weekend working", weight: 10, type: "boolean", required: true },
    { key: "dementia", label: "Dementia care experience", weight: 10, type: "boolean", required: false },
  ];
  // ── Default application form template (B2a) ──
  const [tplR] = await db.from("applicationFormTemplates").insert<{ id: number }>({
    name: "Care Worker — Standard",
    status: "active",
    schemaJson: defaultCareWorkerForm() as never,
    createdBy: "System",
  });
  const defaultTemplateId = tplR.id;

  const jobIds: number[] = [];
  const formVersionByJob: Record<number, number> = {};
  const jobs: [string, string, string][] = [
    ["Domiciliary Care Worker — Erdington & Yardley", "Erdington, Birmingham", "£12.85–£13.40/hr + mileage"],
    ["Senior Care Worker (Evenings & Weekends)", "Sheldon, Birmingham", "£13.80–£14.50/hr + mileage"],
  ];
  for (const [title, loc, salary] of jobs) {
    const [r] = await db.from("jobPostings").insert<{ id: number }>({
      title, location: loc, postcode: "B23 6RY", salaryText: salary,
      employmentType: "full_time",
      descriptionMd: `## ${title}\n\nUnique Care UK is a CQC-registered domiciliary care provider. We are looking for compassionate, reliable care workers to support people in their own homes across ${loc}.\n\n### What you will do\n- Personal care, medication support, meal preparation and companionship\n- Follow person-centred care plans and keep accurate visit records\n- Work with the office team to keep clients safe and happy at home\n\n### What we offer\n- ${salary}\n- Full paid induction, Care Certificate and ongoing training\n- Blue Light Card, pension, paid travel time between visits\n- Supportive team with real progression routes`,
      requirements: jobReqs, screeningThreshold: 85, status: "live",
      closesAt: dateStr(new Date(Date.now() + 30 * 864e5)),
      publicSlug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      applySlug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${token().slice(0, 6)}`,
      applyLinkEnabled: true,
      applyLinkCreatedAt: new Date(),
    });
    const jobId = r.id;
    jobIds.push(jobId);

    // Per-job application form copied from the default template + published v1 (B2a)
    const [formR] = await db.from("applicationForms").insert<{ id: number }>({
      jobPostingId: jobId, templateId: defaultTemplateId,
      name: "Care Worker — Standard",
      draftSchema: defaultCareWorkerForm() as never,
    });
    const formId = formR.id;
    const [verR] = await db.from("applicationFormVersions").insert<{ id: number }>({
      formId, version: 1, schemaJson: defaultCareWorkerForm() as never, publishedBy: "System",
    });
    const versionId = verR.id;
    await db.from("applicationForms").eq("id", formId).update({ publishedVersionId: versionId });
    await db.from("jobPostings").eq("id", jobId).update({ applicationFormId: formId });
    formVersionByJob[jobId] = versionId;

    // A couple of tracked link variants per job (B1)
    await db.from("jobLinkSources").insert<{ id: number }>([
      { jobPostingId: jobId, label: "Facebook group post", slug: "facebook-group", createdBy: "Daniel Whitfield" },
      { jobPostingId: jobId, label: "Job fair flyer QR", slug: "job-fair-flyer", createdBy: "Daniel Whitfield" },
    ]);
  }

  // ── Candidates & applications across the pipeline ──
  const stagePlan: ApplicationStage[] = [
    "applied", "applied", "applied", "review", "shortlisted",
    "pre_interview_forms_sent", "pre_interview_forms_complete", "interview_booked",
    "interviewed", "approved", "compliance_docs_requested", "compliance_docs_complete",
    "offer_sent", "offer_accepted", "online_training_in_progress",
  ];
  const candidateIds: number[] = [];
  const applicationIds: number[] = [];
  for (let i = 0; i < stagePlan.length; i++) {
    const female = rnd() < 0.7;
    const fn = female ? pick(FIRST_F) : pick(FIRST_M);
    const ln = pick(LAST);
    const jobId = jobIds[i % 2];
    const [cr] = await db.from("candidates").insert<{ id: number }>({
      firstName: fn, lastName: ln, email: `${fn.toLowerCase()}.${ln.toLowerCase()}.c${i}@example.com`,
      phone: `07800 11${ri(1000, 9999)}`, postcode: pick(POSTCODES).pc,
      rightToWorkStatus: pick(["British citizen", "Settled status", "Skilled worker visa"]),
      hasDrivingLicence: rnd() < 0.6, hasVehicle: rnd() < 0.5,
      sourceChannel: pick(["direct", "facebook-group", "job-fair-flyer"]),
    });
    const cid = cr.id;
    candidateIds.push(cid);
    const stage = stagePlan[i];
    const scored = !["applied", "review"].includes(stage) || rnd() < 0.5;
    const score = scored ? ri(48, 97) : null;
    const history: { from: string | null; to: string; actor: string; at: string }[] = [
      { from: null, to: "applied", actor: "System", at: new Date(Date.now() - ri(3, 20) * 864e5).toISOString() },
    ];
    if (stage !== "applied")
      history.push({ from: "applied", to: stage, actor: "Daniel Whitfield", at: new Date(Date.now() - ri(1, 3) * 864e5).toISOString() });
    const [ar] = await db.from("applications").insert<{ id: number }>({
      jobPostingId: jobId, candidateId: cid,
      formVersionId: formVersionByJob[jobId] ?? null,
      sourceChannel: pick(["direct", "facebook-group", "job-fair-flyer", "direct"]),
      cvText: `${fn} ${ln} — care assistant with ${ri(1, 6)} years' experience in domiciliary and residential care. Medication prompting, personal care, moving and handling. ${rnd() < 0.4 ? "Care Certificate completed. " : ""}Available weekends. ${rnd() < 0.5 ? "Driver with own car." : ""}`,
      cvFileName: `${fn}_${ln}_CV.pdf`,
      answers: { rtw: "yes", weekends: "yes", experience_years: ri(0, 8) },
      aiScore: score,
      aiSummary: scored ? `${fn} shows ${score! >= 85 ? "strong" : "partial"} alignment with the role requirements. Evidence drawn from CV and application answers.` : null,
      aiFlags: score !== null && score < 60 ? ["employment gap 2023", "no driving licence"] : score !== null && score < 85 ? ["Care Certificate not evidenced"] : [],
      aiBreakdown: scored
        ? jobReqs.map((rq) => ({
            requirement_key: rq.key,
            met: score! >= 85 ? "yes" : pick(["yes", "partial", "unknown"]),
            evidence_quote: "From CV/application answers",
            points: Math.round(rq.weight * (score! / 100)),
          }))
        : null,
      stage, stageHistory: history, portalToken: token(),
    });
    applicationIds.push(ar.id);
  }

  // Pre-interview forms for those past that stage
  for (let i = 0; i < stagePlan.length; i++) {
    if (["pre_interview_forms_complete", "interview_booked", "interviewed", "approved", "compliance_docs_requested", "compliance_docs_complete", "offer_sent", "offer_accepted", "online_training_in_progress"].includes(stagePlan[i])) {
      await db.from("preInterviewForms").insert<{ id: number }>({
        applicationId: applicationIds[i],
        data: {
          personalDetails: { niNumber: "QQ 12 34 56 A" },
          addressHistory: [{ from: "2021-01", to: "present", address: "12 Example Street, Birmingham" }],
          employmentHistory: [{ employer: "CareHome Ltd", role: "Care Assistant", from: "2022-03", to: "2025-08" }],
          dbs: { certificateNo: `001${ri(100000000, 999999999)}`, issueDate: "2025-02-10", updateService: true },
          referees: [
            { name: "Sam Ollerenshaw", email: "sam@carehome.example", relationship: "Manager", mostRecent: true },
            { name: "June Pike", email: "june@agency.example", relationship: "Coordinator", mostRecent: false },
          ],
          healthDeclaration: { fit: true },
        },
        submittedAt: new Date(Date.now() - ri(1, 5) * 864e5),
      });
    }
  }

  // Interview slots (this week + next) and bookings
  const slotIds: number[] = [];
  for (let w = 0; w < 2; w++) {
    for (const dOff of [1, 3]) {
      const d = new Date(mon); d.setDate(d.getDate() + w * 7 + dOff);
      for (const t of ["10:00", "11:30", "14:00"]) {
        const startAt = dt(d, t);
        const [r] = await db.from("interviewSlots").insert<{ id: number }>({
          jobPostingId: jobIds[w % 2], startsAt: startAt, endsAt: new Date(startAt.getTime() + 45 * 60000),
          panelMemberIds: [staffIds[5], staffIds[3]], capacity: 2,
          teamsMeetingUrl: "https://teams.microsoft.com/l/meetup-join/ucuk-interview",
          locationText: "Microsoft Teams (video interview)",
        });
        slotIds.push(r.id);
      }
    }
  }
  const bookedIdx = [7, 8, 9, 10, 11, 12, 13, 14];
  for (let k = 0; k < bookedIdx.length; k++) {
    const i = bookedIdx[k];
    await db.from("interviewBookings").insert<{ id: number }>({
      slotId: slotIds[k % slotIds.length], applicationId: applicationIds[i],
      status: ["interviewed", "approved", "compliance_docs_requested", "compliance_docs_complete", "offer_sent", "offer_accepted", "online_training_in_progress"].includes(stagePlan[i]) ? "attended" : "booked",
    });
  }
  // Scorecards for interviewed+
  const criteria = ["Values & motivation", "Person-centred care", "Safeguarding awareness", "Communication", "Reliability", "Scenario judgement"];
  for (const i of [8, 9, 10, 11, 12, 13, 14]) {
    for (const pm of [staffIds[5], staffIds[3]]) {
      const scores = criteria.map((c) => ({ criterion: c, score: ri(3, 5), comment: "" }));
      const total = scores.reduce((a, b) => a + b.score, 0);
      await db.from("interviewScorecards").insert<{ id: number }>({
        applicationId: applicationIds[i], panelMemberId: pm, scores, total: String(total),
        recommendation: total >= 24 ? "yes" : "no", submittedAt: new Date(Date.now() - 864e5),
      });
    }
  }

  // Compliance documents for approved+ candidates and for staff
  const reqKeys = complianceReqs.map((c) => c[0]);
  for (const i of [10, 11, 12, 13, 14]) {
    for (const key of reqKeys) {
      const verified = stagePlan[i] === "compliance_docs_complete" || stagePlan[i] === "offer_sent" || stagePlan[i] === "offer_accepted" || stagePlan[i] === "online_training_in_progress";
      await db.from("complianceDocuments").insert<{ id: number }>({
        ownerType: "candidate", ownerId: candidateIds[i], requirementKey: key,
        fileName: verified ? `${key}.pdf` : null,
        status: verified ? "verified" : pick(["requested", "uploaded"]),
        verifiedBy: verified ? "Daniel Whitfield" : null,
        verifiedAt: verified ? new Date(Date.now() - 864e5) : null,
      });
    }
  }
  // Staff compliance (mostly verified; a few expiring soon)
  for (const sid of staffIds) {
    for (const key of ["dbs_enhanced", "right_to_work", "photo_id", "health_declaration"]) {
      const expiring = rnd() < 0.12;
      await db.from("complianceDocuments").insert<{ id: number }>({
        ownerType: "staff", ownerId: sid, requirementKey: key, fileName: `${key}.pdf`,
        status: "verified", verifiedBy: "Daniel Whitfield", verifiedAt: new Date(Date.now() - 300 * 864e5),
        expiresAt: expiring ? dateStr(new Date(Date.now() + ri(7, 29) * 864e5)) : dateStr(new Date(Date.now() + ri(90, 700) * 864e5)),
      });
    }
  }
  // References for approved+
  for (const i of [9, 10, 11, 12, 13, 14]) {
    await db.from("references").insert<{ id: number }>([
      { applicationId: applicationIds[i], refereeName: "Sam Ollerenshaw", refereeEmail: "sam@carehome.example", relationship: "Manager", isMostRecentEmployer: true, status: i >= 11 ? "verified" : "requested", token: token() },
      { applicationId: applicationIds[i], refereeName: "June Pike", refereeEmail: "june@agency.example", relationship: "Coordinator", isMostRecentEmployer: false, status: i >= 11 ? "verified" : "received", token: token() },
    ]);
  }
  // Offer letters for offer_sent / accepted
  for (const i of [12, 13, 14]) {
    const accepted = stagePlan[i] !== "offer_sent";
    await db.from("offerLetters").insert<{ id: number }>({
      applicationId: applicationIds[i], templateVersion: "v1",
      content: "Offer of employment as Care Worker at Unique Care UK, subject to satisfactory completion of mandatory training.",
      sentAt: new Date(Date.now() - 3 * 864e5),
      acceptedAt: accepted ? new Date(Date.now() - 2 * 864e5) : null,
      signatureName: accepted ? "Signed electronically" : null,
      signatureIp: accepted ? "86.10.22.4" : null,
    });
  }
  // Online training enrolments for accepted candidate
  for (const c of courseIds.filter((_, idx) => idx !== 3)) {
    await db.from("trainingEnrolments").insert<{ id: number }>({
      courseId: c, personType: "candidate", personId: candidateIds[14],
      status: rnd() < 0.6 ? "completed" : "in_progress",
      completedAt: rnd() < 0.6 ? new Date(Date.now() - 864e5) : null,
    });
  }
  // Staff training records (mostly complete, a few expiring)
  for (const sid of staffIds) {
    for (const c of courseIds) {
      const done = rnd() < 0.9;
      const expiring = rnd() < 0.1;
      await db.from("trainingEnrolments").insert<{ id: number }>({
        courseId: c, personType: "staff", personId: sid,
        status: done ? "completed" : "invited",
        completedAt: done ? new Date(Date.now() - ri(30, 300) * 864e5) : null,
        expiresAt: done && expiring ? dateStr(new Date(Date.now() + ri(5, 28) * 864e5)) : done ? dateStr(new Date(Date.now() + ri(100, 700) * 864e5)) : null,
      });
    }
  }

  // ── Rota: current week, published ──
  const weekStart = mondayOfCurrentWeek();
  const [rw] = await db.from("rotaWeeks").insert<{ id: number }>({
    weekStartDate: dateStr(weekStart), status: "published",
    publishedAt: new Date(Date.now() - 2 * 864e5), publishedBy: "Sofia Marsh",
  });
  const rotaWeekId = rw.id;
  const templates = await db.from("visitTemplates").many<VisitTemplates>();
  const assignedWorkerRows = await db.from("clientAssignedWorkers").many<ClientAssignedWorkers>();
  const staffById = new Map<number, string>();
  const allStaff = await db.from("staffProfiles").many<StaffProfiles>();
  for (const st of allStaff) staffById.set(Number(st.id), st.fullName);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let visitCount = 0;
  for (const t of templates) {
    const day = new Date(weekStart); day.setDate(day.getDate() + t.dayOfWeek);
    const start = dt(day, t.startTime);
    const end = new Date(start.getTime() + t.durationMinutes * 60000);
    const workers = assignedWorkerRows.filter((a) => a.clientId === t.clientId);
    const leaveUnassigned = rnd() < 0.06;
    const assigned = !leaveUnassigned && workers.length > 0;
    const past = end.getTime() < Date.now();
    const status = assigned ? (past ? (rnd() < 0.04 ? "missed" : "completed") : "assigned") : "unassigned";
    const [vr] = await db.from("visits").insert<{ id: number }>({
      rotaWeekId, clientId: t.clientId, visitTemplateId: t.id,
      scheduledStart: start, scheduledEnd: end, callType: t.callType,
      visitType: t.visitType, status: status as never,
      notes: null,
    });
    const vid = vr.id;
    visitCount++;
    if (assigned) {
      const lead = workers[0];
      await db.from("visitAssignments").insert<{ id: number }>({
        visitId: vid, staffId: lead.staffId, slot: "lead", assignedBy: "system",
        assignmentReason: `Primary carer for client; has required skills; within availability.`,
        travelMinutesFromPrevious: ri(5, 20),
        status: past ? "accepted" : "assigned",
      });
      if (t.callType === "double") {
        const second = pick(activeCw.filter((w) => w !== lead.staffId));
        await db.from("visitAssignments").insert<{ id: number }>({
          visitId: vid, staffId: second, slot: "second", assignedBy: "system",
          assignmentReason: "Second worker for double-handed call; no conflicts.",
          travelMinutesFromPrevious: ri(5, 25), status: "assigned",
        });
      }
    }
  }
  console.log(`Seeded ${visitCount} visits for the current week.`);

  // ── CRM: organisations & contacts ──
  const orgDefs: [string, "local_authority" | "nhs_icb" | "hospital" | "gp" | "supplier" | "agency" | "other", string][] = [
    ["Birmingham City Council — Adult Social Care", "local_authority", "0121 303 1234"],
    ["NHS Birmingham & Solihull ICB", "nhs_icb", "0121 203 3300"],
    ["Heartlands Hospital Discharge Team", "hospital", "0121 424 2000"],
    ["Erdington Medical Centre", "gp", "0121 373 0590"],
    ["MediSupplies UK", "supplier", "0345 120 2200"],
    ["Birmingham Care Agency Network", "agency", "0121 555 0199"],
  ];
  const orgIds: number[] = [];
  for (const [name, type, phone] of orgDefs) {
    const [r] = await db.from("crmOrganisations").insert<{ id: number }>({ name, type, phone });
    orgIds.push(r.id);
  }
  const clientsAll = await db.from("clients").many<Clients>();
  const contactIds: number[] = [];
  // client contacts
  for (const c of clientsAll) {
    const [r] = await db.from("crmContacts").insert<{ id: number }>({
      contactType: "client", firstName: c.firstName, lastName: c.lastName,
      phone: c.phone, address: c.addressLine1, postcode: c.postcode,
      linkedClientId: c.id, lifecycleStage: c.status === "active" ? "active" : "former",
      ownerId: staffIds[2], source: "referral",
    });
    contactIds.push(r.id);
    // family member for ~60%
    if (rnd() < 0.6) {
      const kin = (c.nextOfKin as { name: string; relationship: string; phone: string }) ?? {
        name: `Alex ${c.lastName}`, relationship: "Daughter", phone: "07700 900000",
      };
      const [kfn, ...kln] = kin.name.split(" ");
      const [kr] = await db.from("crmContacts").insert<{ id: number }>({
        contactType: "family_member", firstName: kfn, lastName: kln.join(" ") || c.lastName,
        phone: kin.phone, email: `${kfn.toLowerCase()}.${c.lastName.toLowerCase()}@example.com`,
        linkedClientId: c.id, lifecycleStage: "n_a", ownerId: staffIds[6], source: "family",
        preferredChannel: pick(["phone", "email"]),
      });
      await db.from("crmContactRelationships").insert<{ id: number }>({
        contactId: kr.id, relatedContactId: r.id,
        relationship: `${kin.relationship} of client`,
      });
    }
  }
  // commissioners, social workers, GPs, prospective clients
  const extraContacts: [string, number | null][] = [
    ["commissioner", orgIds[0]], ["commissioner", orgIds[1]], ["social_worker", orgIds[0]],
    ["gp_practice", orgIds[3]], ["hospital", orgIds[2]], ["prospective_client", null],
    ["prospective_client", null], ["prospective_client", null],
  ];
  for (const [type, orgId] of extraContacts) {
    const fn = pick(FIRST_F.concat(FIRST_M)); const ln = pick(LAST);
    const [r] = await db.from("crmContacts").insert<{ id: number }>({
      contactType: type, firstName: fn, lastName: ln, organisationId: orgId ?? null,
      jobTitle: type === "commissioner" ? "Commissioning Officer" : type === "social_worker" ? "Social Worker" : null,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@example.org`,
      phone: `0121 ${ri(200, 999)} ${ri(1000, 9999)}`,
      lifecycleStage: type === "prospective_client" ? "enquiry" : "active",
      ownerId: staffIds[6], source: pick(["phone", "web_form", "email"]),
      tags: type === "prospective_client" ? ["new-enquiry"] : [],
    });
    contactIds.push(r.id);
  }

  // ── CRM: tickets ──
  const ticketDefs: {
    subject: string; category: string; priority: string;
    status: string; channel: string; desc: string;
  }[] = [
    { subject: "Missed evening medication visit on Tuesday", category: "missed_or_late_visit", priority: "urgent", status: "escalated", channel: "phone", desc: "Mrs Smith's daughter called — the 21:00 medication visit did not happen yesterday. Client missed evening dose." },
    { subject: "New care enquiry — 4 calls/week for father in Yardley", category: "new_care_enquiry", priority: "high", status: "in_progress", channel: "web", desc: "Enquiry via website form. Father discharged from Heartlands next week, needs personal care mornings." },
    { subject: "Invoice query — March commissioning statement", category: "billing_invoice", priority: "normal", status: "open", channel: "email", desc: "Birmingham City Council querying 3 hours difference on the March statement." },
    { subject: "Complaint — carer arrived 40 minutes late twice", category: "complaint", priority: "high", status: "in_progress", channel: "phone", desc: "Formal complaint from client's son. Requests call-back from the Registered Manager." },
    { subject: "Compliment for carer Amara Okafor", category: "compliment", priority: "low", status: "resolved", channel: "email", desc: "Family emailed to thank Amara for exceptional care of their mother." },
    { subject: "Request rota change — swap Thursday morning", category: "rota_change", priority: "normal", status: "open", channel: "phone", desc: "Client has hospital appointment; move 09:00 medication call to 13:00 this Thursday." },
    { subject: "Safeguarding concern raised by carer during visit", category: "safeguarding_concern", priority: "urgent", status: "escalated", channel: "internal", desc: "Carer reported unexplained bruising and dishevelled home. Immediate review required by Registered Manager." },
    { subject: "Medication query — new prescription not in care plan", category: "medication_query", priority: "high", status: "waiting_on_internal", channel: "phone", desc: "GP added new antibiotic; care plan needs updating before tomorrow's visit." },
    { subject: "Recruitment query — DBS update service", category: "recruitment_query", priority: "normal", status: "open", channel: "email", desc: "Candidate asks whether we accept DBS Update Service checks." },
    { subject: "Commissioner requests quarterly KPI report", category: "commissioner_request", priority: "normal", status: "in_progress", channel: "email", desc: "Birmingham City Council requests missed-visit and continuity KPIs for Q3." },
    { subject: "Key safe code changed at flat 12", category: "care_query", priority: "normal", status: "resolved", channel: "phone", desc: "New code provided by family; rota notes updated." },
    { subject: "Follow-up: hospital discharge package review", category: "care_query", priority: "normal", status: "new", channel: "email", desc: "Discharge team asks for review of increased package starting Monday." },
  ];
  const ticketIds: number[] = [];
  for (let i = 0; i < ticketDefs.length; i++) {
    const t = ticketDefs[i];
    const contactId = contactIds[i % contactIds.length];
    const clientRow = clientsAll[i % clientsAll.length];
    const isSafeguarding = t.category === "safeguarding_concern";
    const isComplaint = t.category === "complaint";
    const created = new Date(Date.now() - ri(1, 96) * 36e5);
    const slaMap: Record<string, [number, number]> = { urgent: [30, 120], high: [60, 480], normal: [240, 1440], low: [1440, 4320] };
    const sla = slaMap[t.priority!]!;
    const resolved = t.status === "resolved" || t.status === "closed";
    const [r] = await db.from("tickets").insert<{ id: number }>({
      ticketNo: `UC-${String(100 + i).padStart(6, "0")}`,
      subject: t.subject, description: t.desc, category: t.category, priority: t.priority,
      status: t.status, channel: t.channel, requesterContactId: contactId,
      clientId: ["missed_or_late_visit", "care_query", "medication_query", "safeguarding_concern", "complaint", "rota_change"].includes(t.category!) ? clientRow.id : null,
      assigneeId: isSafeguarding ? staffIds[0] : pick([staffIds[6], staffIds[1], staffIds[2]]),
      teamId: pick(teamIds),
      escalationLevel: t.status === "escalated" ? 1 : 0,
      firstResponseDueAt: new Date(created.getTime() + sla[0] * 60000),
      firstRespondedAt: t.status !== "new" ? new Date(created.getTime() + ri(10, 60) * 60000) : null,
      dueAt: new Date(created.getTime() + sla[1] * 60000),
      resolvedAt: resolved ? new Date(Date.now() - ri(2, 30) * 36e5) : null,
      isFormalComplaint: isComplaint,
      createdAt: created,
    });
    const tid = r.id;
    ticketIds.push(tid);
    await db.from("ticketEvents").insert<{ id: number }>([
      { ticketId: tid, actorName: "System", event: "created", toValue: t.status, at: created },
      ...(t.status === "escalated"
        ? [{ ticketId: tid, actorName: "System", event: "escalated", fromValue: "open", toValue: "escalated", at: new Date(created.getTime() + 36e5) }]
        : []),
    ]);
    // interaction + comment
    await db.from("interactions").insert<{ id: number }>({
      type: t.channel === "phone" ? "inbound_call" : t.channel === "email" ? "email_in" : t.channel === "web" ? "web_form" : "note",
      direction: "inbound", contactId, clientId: clientRow.id, ticketId: tid,
      subject: t.subject, body: t.desc, occurredAt: created,
      durationSeconds: t.channel === "phone" ? ri(120, 900) : null,
      loggedBy: "Tanya Reid", outcome: "ticket_created",
    });
    await db.from("ticketComments").insert<{ id: number }>({
      ticketId: tid, authorId: staffIds[6], authorName: "Tanya Reid",
      body: "Logged and triaged. Awaiting owner review.", visibility: "internal", mentions: [],
    });
    if (isSafeguarding) {
      await db.from("ticketWatchers").insert<{ id: number }>([
        { ticketId: tid, staffId: staffIds[0], reason: "escalated" },
        { ticketId: tid, staffId: staffIds[3], reason: "tagged" },
      ]);
    }
  }

  // ── Tasks ──
  await db.from("tasks").insert<{ id: number }>([
    { title: "Return missed call — Mrs Hill's daughter", dueAt: new Date(Date.now() + 2 * 36e5), assigneeId: staffIds[6], assigneeName: "Tanya Reid", createdByName: "System", relatedType: "contact", relatedId: contactIds[2], status: "open", priority: "high" },
    { title: "Send acknowledgement letter for formal complaint", dueAt: new Date(Date.now() + 24 * 36e5), assigneeId: staffIds[0], assigneeName: "Ruby Osei", createdByName: "Tanya Reid", relatedType: "ticket", relatedId: ticketIds[3], status: "open", priority: "high" },
    { title: "Prepare Q3 KPI report for commissioner", dueAt: new Date(Date.now() + 72 * 36e5), assigneeId: staffIds[1], assigneeName: "Daniel Whitfield", createdByName: "Ruby Osei", relatedType: "ticket", relatedId: ticketIds[9], status: "open", priority: "normal" },
    { title: "Verify uploaded DBS certificate — new candidate", dueAt: new Date(Date.now() + 48 * 36e5), assigneeId: staffIds[1], assigneeName: "Daniel Whitfield", createdByName: "System", relatedType: "candidate", relatedId: candidateIds[10], status: "open", priority: "normal" },
    { title: "Call GP surgery re: medication change", dueAt: new Date(Date.now() - 4 * 36e5), assigneeId: staffIds[2], assigneeName: "Sofia Marsh", createdByName: "Tanya Reid", relatedType: "ticket", relatedId: ticketIds[7], status: "open", priority: "urgent" },
  ]);

  // ── CQC: care plans, reviews, change events, supervisor notes, appraisals, incidents ──
  const planTemplates = await db.from("documentTemplates").many<DocumentTemplates>();
  const careTpl = planTemplates.find((t) => t.kind === "care_plan")!;
  const supportTpl = planTemplates.find((t) => t.kind === "support_plan")!;
  for (let i = 0; i < clientsAll.length; i++) {
    const c = clientsAll[i];
    const approved = i % 6 !== 5;
    const overdueReview = i % 7 === 3;
    const reviewDue = overdueReview
      ? dateStr(new Date(Date.now() - ri(3, 20) * 864e5))
      : dateStr(new Date(Date.now() + ri(30, 340) * 864e5));
    const content: Record<string, string> = {};
    for (const sec of carePlanStructure) {
      content[sec.key] = `${c.firstName} (${c.clientRef}) — ${sec.title.toLowerCase()} recorded from assessment and reviewed with family. Person-centred detail held on file.`;
    }
    const [pr] = await db.from("carePlans").insert<{ id: number }>({
      clientId: c.id, templateId: careTpl.id, planType: "care", version: 1,
      status: approved ? "approved" : "in_review",
      content, approvedBy: approved ? "Ngozi Eze" : null,
      approvedAt: approved ? new Date(Date.now() - ri(30, 300) * 864e5) : null,
      nextReviewDue: reviewDue,
    });
    const planId = pr.id;
    if (overdueReview || i % 9 === 4) {
      await db.from("planReviews").insert<{ id: number }>({
        planType: "care", planId, clientId: c.id, dueDate: reviewDue,
        trigger: overdueReview ? "annual" : "change_in_needs",
        status: overdueReview ? "overdue" : "due",
      });
    }
    if (i % 4 === 0) {
      const sc: Record<string, string> = {};
      for (const sec of supportPlanStructure) sc[sec.key] = `${c.firstName} — recorded at review.`;
      await db.from("carePlans").insert<{ id: number }>({
        clientId: c.id, templateId: supportTpl.id, planType: "support", version: 1,
        status: "approved", content: sc, approvedBy: "Ngozi Eze",
        approvedAt: new Date(Date.now() - ri(30, 200) * 864e5),
        nextReviewDue: dateStr(new Date(Date.now() + ri(60, 300) * 864e5)),
      });
    }
  }
  // change events
  const ceTypes = ["hospital_discharge", "medication_change", "mobility_change", "incident", "family_request"] as const;
  for (let i = 0; i < 6; i++) {
    const trig = i < 3;
    await db.from("clientChangeEvents").insert<{ id: number }>({
      clientId: clientsAll[i * 3].id, type: ceTypes[i % ceTypes.length],
      description: pick([
        "Discharged from Heartlands after a fall at home. New mobility needs.",
        "GP changed evening medication; new dose schedule received.",
        "Family reports increased confusion in the evenings.",
        "Slip in the bathroom — no injury, wet floor signage added.",
        "Daughter requests welfare check frequency increased.",
      ]),
      reportedBy: pick(["Ngozi Eze", "Marcus Field", "Tanya Reid"]),
      occurredAt: new Date(Date.now() - ri(2, 30) * 864e5), triggersReview: trig,
    });
  }
  // supervisor notes
  const noteTypes = ["spot_check", "supervision", "verbal_feedback", "observation"] as const;
  for (let i = 0; i < 24; i++) {
    const sid = activeCw[i % activeCw.length];
    const rating = ri(3, 5);
    await db.from("supervisorNotes").insert<{ id: number }>({
      staffId: sid, supervisorId: staffIds[4], supervisorName: "Marcus Field",
      clientId: clientsAll[i % clientsAll.length].id,
      noteType: noteTypes[i % 4], method: rnd() < 0.4 ? "voice" : "typed",
      transcript: "Observed a personal care visit. Carer introduced themselves, confirmed consent, followed the moving and handling plan and chatted warmly throughout.",
      structured: {
        safe: "Followed care plan and infection control.", effective: "Medication prompt given correctly.",
        caring: "Warm, unhurried, person-centred interaction.", responsive: "Noted client's request for earlier tea visit.",
        well_led: "Records completed accurately on the visit.",
      },
      rating,
      strengths: "Excellent rapport with client; thorough record keeping.",
      improvements: rating < 5 ? "Arrive within the agreed time window more consistently." : null,
      actions: rating < 4 ? [{ action: "Shadow senior carer on next double-handed call", done: false }] : [],
      visibleToStaff: rnd() < 0.7,
      createdAt: new Date(Date.now() - ri(1, 90) * 864e5),
    });
  }
  // appraisals
  for (const sid of activeCw.slice(0, 8)) {
    await db.from("appraisals").insert<{ id: number }>({
      staffId: sid, periodStart: "2025-01-01", periodEnd: "2025-12-31",
      appraiserId: staffIds[3], appraiserName: "Ngozi Eze",
      aiDraft: { summary: "Strong year: high visit reliability and positive supervision feedback." },
      status: rnd() < 0.5 ? "signed" : "completed",
      signedByStaffAt: rnd() < 0.5 ? new Date(Date.now() - 30 * 864e5) : null,
      nextAppraisalDue: dateStr(new Date(Date.now() + ri(30, 200) * 864e5)),
    });
  }
  // incidents
  await db.from("incidents").insert<{ id: number }>([
    { clientId: clientsAll[0].id, occurredAt: new Date(Date.now() - 5 * 864e5), category: "Fall (no injury)", description: "Client slipped from commode; carer assisted. No injury. Family informed.", severity: "low", actionsTaken: "Care plan reviewed; equipment check booked.", notifiableToCqc: false, status: "closed" },
    { clientId: clientsAll[3].id, occurredAt: new Date(Date.now() - 2 * 864e5), category: "Medication omission", description: "Evening dose omitted after missed visit. GP consulted; no adverse effect.", severity: "moderate", actionsTaken: "Rota escalation reviewed; family updated.", notifiableToCqc: false, status: "investigating" },
    { clientId: clientsAll[6].id, occurredAt: new Date(Date.now() - 864e5), category: "Safeguarding — unexplained bruising", description: "Bruising noted on upper arm during personal care. Safeguarding referral submitted to Birmingham City Council.", severity: "serious", actionsTaken: "Safeguarding referral made; Registered Manager informed; visits now double-handed.", notifiableToCqc: true, status: "open" },
  ]);

  // ── Automation rules ──
  const rules: [string, string, string][] = [
    ["application_submitted", "Application submitted → confirm + queue AI screening", "Confirmation email to the candidate; AI screening job queued."],
    ["ai_shortlist", "AI score ≥ threshold → shortlist", "Shortlist the application and email the interview invitation + pre-interview form link."],
    ["form_reminders", "Pre-interview form reminders", "Remind at 48h and 96h; flag to admin after 7 days."],
    ["form_complete_unlock", "Form complete → unlock interview booking", "Unlock slot booking in the candidate portal and notify HR."],
    ["interview_booked", "Interview booked → confirmations", "Create the meeting link and send confirmations with .ics to panel and candidate."],
    ["panel_complete", "All scorecards submitted → notify admin", "Tell HR the candidate is ready for a decision."],
    ["admin_approves", "Admin approves → request statutory documents", "Email requests for every outstanding compliance item and both references."],
    ["reference_chase", "Reference chase", "Chase referees after 3 and 7 days."],
    ["compliance_complete_offer", "All compliance verified → offer letter", "Generate and send the offer letter automatically."],
    ["offer_accepted_training", "Offer accepted → enrol training", "Enrol on mandatory online courses; invite to register for classroom training."],
    ["auto_reassign", "Worker unavailable → auto-reassign visits", "Run the assignment engine on affected visits; escalate failures."],
    ["plan_review_alerts", "Plan review alerts", "Notify team leader 30/7 days before review due; escalate overdue."],
    ["expiry_alerts", "Compliance & training expiry alerts", "Notify staff + admin at 60/30/7 days before expiry."],
    ["sla_breach", "SLA breach → auto-escalate", "Escalate per policy and notify the next level."],
    ["safeguarding_alert", "Safeguarding ticket → alert immediately", "Set Urgent, alert Registered Manager and safeguarding lead."],
    ["complaint_clock", "Complaint procedure clock", "Acknowledgement in 3 working days; response in 20 working days."],
    ["ticket_autoclose", "Resolved 7 days → auto-close + survey", "Close resolved tickets after 7 days and send a satisfaction survey."],
    ["task_overdue", "Task overdue 24h → alert line manager", "Remind assignee at due time; alert manager after 24h."],
  ];
  for (const [key, label, desc] of rules) {
    await db.from("automationRules").insert<{ id: number }>({ key, label, description: desc, enabled: true, lastStatus: "never" });
  }

  // ── Notifications for the office ──
  await db.from("notifications").insert<{ id: number }>([
    { staffId: staffIds[0], type: "safeguarding", title: "Safeguarding concern escalated", body: "UC-000106 requires immediate Registered Manager review.", link: "/crm/tickets" },
    { staffId: staffIds[1], type: "compliance", title: "3 compliance documents expiring within 30 days", body: "DBS and training renewals due — see the compliance matrix.", link: "/staff/compliance" },
    { staffId: staffIds[2], type: "rota", title: "Unfilled visits this week", body: "Visits remain unassigned in the current rota week.", link: "/rota" },
    { staffId: staffIds[1], type: "hr", title: "Candidate ready for decision", body: "All panel scorecards submitted for 2 candidates.", link: "/recruitment/pipeline" },
  ]);

  console.log("Seed complete ✔");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
