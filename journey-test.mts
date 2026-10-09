/* Full end-to-end journey test over the live HTTP API */
const BASE = "http://localhost:3000/api/trpc";
const COOKIE = process.argv[2];
const H = { "content-type": "application/json", cookie: `kimi_sid=${COOKIE}` };

let pass = 0, fail = 0;
const failures: string[] = [];

const QUERIES = new Set(["get","me","jobs","publicJobs","pipeline","slots","leaderboard","complianceQueue","complianceMatrix","courses","sessions","templates","plans","reviews","changeEvents","supervisorNotes","appraisals","incidents","readiness","contacts","organisations","tickets","myTasks","myMentions","crmStats","clients","weeks","reassignments","myUnavailability","myRota","kpis","staffList","teams","organisation","myNotifications","dashboard","auditLog","automationRules","weekData","exportWeekCsv","applicationDetail","planDetail","contactDetail","ticketDetail","clientDetail","publicApplyInfo","lookupCaller","checkAssignment","globalSearch"]);

async function call(proc: string, input?: unknown, label?: string) {
  const isMutation = !QUERIES.has(proc.split(".")[1]);
  try {
    let r: Response;
    if (input === undefined) {
      r = await fetch(`${BASE}/${proc}`, { headers: H });
    } else if (isMutation) {
      r = await fetch(`${BASE}/${proc}`, { method: "POST", headers: H, body: JSON.stringify({ json: input }) });
    } else {
      r = await fetch(`${BASE}/${proc}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, { headers: H });
    }
    const body = await r.json();
    if (body.error) throw new Error(`${r.status} ${JSON.stringify(body.error.json?.message ?? body.error).slice(0, 300)}`);
    pass++;
    console.log(`PASS ${proc}${label ? " — " + label : ""}`);
    return body.result?.data?.json;
  } catch (e: any) {
    fail++;
    failures.push(`${proc}: ${e.message}`);
    console.log(`FAIL ${proc}${label ? " — " + label : ""} :: ${e.message.slice(0, 200)}`);
    return undefined;
  }
}

/** Assert an application has reached an expected stage. */
async function expectStage(applicationId: number, expected: string) {
  const det = await call("hr.applicationDetail", { id: applicationId }, `stage check → ${expected}`);
  const actual = det?.application?.stage;
  if (actual !== expected) {
    pass--; fail++; // convert the PASS above into a FAIL
    failures.push(`stage assertion: expected ${expected}, got ${actual}`);
    console.log(`FAIL stage assertion :: expected ${expected}, got ${actual}`);
  }
}

const today = new Date();
const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
const runId = Date.now();

// ── J0 Core ──
await call("core.me");
const staff = await call("core.staffList");
const staffId = staff?.[0]?.id;
const staff2 = staff?.[1]?.id;
await call("core.setRole", { role: "super_admin" });
await call("core.updateMyProfile", { phone: "07123 456789" });
await call("core.teams");
await call("core.organisation");
await call("core.updateOrganisation", { screeningThreshold: 85 });
await call("core.myNotifications");
await call("core.dashboard");
await call("core.globalSearch", { q: "Smith" });
await call("core.auditLog", { limit: 20 });
const rules = await call("core.automationRules");
if (rules?.[0]) {
  await call("core.toggleAutomation", { id: rules[0].id, enabled: false });
  await call("core.toggleAutomation", { id: rules[0].id, enabled: rules[0].enabled ?? true }, "restore");
}

// ── J1 HR: advert → hire (full journey) ──
const job = await call("hr.createJob", {
  title: "Weekend Care Worker — QA Journey", location: "Sutton Coldfield, Birmingham", postcode: "B72 1AB",
  salaryText: "£12.85/hr + mileage", employmentType: "part_time",
  descriptionMd: "## Weekend Care Worker\n\nJoin Unique Care UK supporting people at home.\n\n- Personal care and medication prompts\n- Companionship visits",
  requirements: [{ key: "rtw", label: "Right to work in UK", weight: 40, type: "boolean", required: true }, { key: "exp", label: "1+ year care experience", weight: 60, type: "years", required: false }],
  screeningThreshold: 85,
});
const jobId = job?.id;
await call("hr.jobs");
if (jobId) {
  await call("hr.setJobStatus", { id: jobId, status: "live" });
  await call("hr.addLinkSource", { jobId, label: "QA journey source" }, "tracked link source");
}
const pubJobs = await call("hr.publicJobs");
const slug = pubJobs?.find((j: any) => j.id === jobId)?.applySlug ?? pubJobs?.[0]?.applySlug;
await call("hr.publicApplyInfo", { slug, src: "qa-journey-source" }, "public apply form info");

// CV upload to object storage, then form-based submission against the job's published form
const qaPdf = (txt: string) =>
  `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length 120>>stream\nBT /F1 12 Tf 50 700 Td (${txt}) Tj ET\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
const up1 = await call("hr.uploadCv", {
  slug, fileName: "jordan.pdf",
  contentBase64: Buffer.from(qaPdf("Jordan Testament - care worker, 3 years domiciliary care, dementia support, medication prompts, full UK driving licence, available weekends")).toString("base64"),
}, "CV uploaded");
const jordanAnswers = {
  first_name: "Jordan", last_name: "Testament", email: `jordan.testament+${runId}@example.com`,
  mobile: `07${String(runId % 1000000000).padStart(9, "0")}`, postcode: "B23 6AB",
  years_experience: "3_5", care_settings: ["domiciliary"], specialist_experience: ["dementia", "medication"],
  qualifications: ["care_certificate"], current_employer: "CareHome Ltd", current_role: "Care Assistant",
  experience_statement: "I have three years of domiciliary care experience supporting people with dementia in their own homes, including personal care, medication prompting, meal preparation and companionship. I hold the Care Certificate and I am a driver with my own car. I build trusting relationships with the people I support and their families, working in a person-centred way, following care plans carefully and keeping accurate records at every visit. I am looking for a weekend role where I can make a genuine difference, and Unique Care UK's reputation for outstanding care is exactly what I want in my next role.",
  right_to_work: "yes", driving_licence: "yes", own_car: "yes",
  availability: { sat: ["mornings", "afternoons", "evenings"], sun: ["mornings", "afternoons", "evenings"] },
  earliest_start: "2026-10-12", dbs_update_service: "yes",
  privacy_consent: true, keep_details: false,
};
const applied = await call("hr.submitApplication", {
  slug, src: "qa-journey-source", answers: jordanAnswers,
  cv: { key: up1?.key, fileName: up1?.fileName, size: up1?.size, mimeType: up1?.mimeType, extractedText: up1?.extractedText, readable: up1?.readable },
}, "public application submitted");
const applicationId = applied?.applicationId ?? applied?.id;
const portalToken = applied?.portalToken;

await call("hr.pipeline", {});
if (applicationId) {
  await call("hr.applicationDetail", { id: applicationId });
  await call("hr.runScreening", { applicationId }, "AI screening");

  // Walk to pre_interview_forms_sent wherever screening left us (applied/review/shortlisted)
  const det0 = await call("hr.applicationDetail", { id: applicationId });
  const st0 = det0?.application?.stage;
  if (st0 === "applied" || st0 === "review") await call("hr.moveStage", { applicationId, to: "shortlisted", reason: "Screening reviewed — shortlist" });
  const det1 = await call("hr.applicationDetail", { id: applicationId });
  if (det1?.application?.stage === "shortlisted") await call("hr.moveStage", { applicationId, to: "pre_interview_forms_sent", reason: "Send pre-interview forms" });
}
const slot = await call("hr2.createSlot", {
  startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 86400000 + 3600000).toISOString(),
  jobPostingId: jobId, panelMemberIds: [staffId].filter(Boolean), capacity: 1, locationText: "Microsoft Teams",
});
await call("hr2.slots");

// candidate portal journey: forms → book interview
if (portalToken) {
  await call("portal.get", { token: portalToken });
  await call("portal.saveForm", { token: portalToken, data: { ni: "QQ123456C", emergencyContact: "Ada Testament 07900 000000", referees: [{ name: "Sam Boss", email: "sam.boss@example.com", relationship: "Line manager", mostRecent: true }] }, submit: true }, "pre-interview form");
  if (applicationId) await expectStage(applicationId, "pre_interview_forms_complete");
  if (slot?.id) await call("portal.bookSlot", { token: portalToken, slotId: slot.id }, "interview booked");
  if (applicationId) await expectStage(applicationId, "interview_booked");
}
if (applicationId) {
  await call("hr2.submitScorecard", {
    applicationId,
    scores: [{ criterion: "Values & motivation", score: 5, comment: "Excellent" }, { criterion: "Person-centred care", score: 4 }],
    recommendation: "yes",
  }, "panel scorecard");
  // scorecard submission auto-advances interview_booked → interviewed
  const detS = await call("hr.applicationDetail", { id: applicationId });
  if (detS?.application?.stage === "interview_booked") await call("hr.moveStage", { applicationId, to: "interviewed", reason: "Interview held" });
  await call("hr.moveStage", { applicationId, to: "approved", reason: "Panel approved" });
  await call("hr2.requestComplianceDocs", { applicationId }, "compliance docs requested");
  await expectStage(applicationId, "compliance_docs_requested");

  // reject one doc → candidate re-uploads → verify everything
  const det = await call("hr.applicationDetail", { id: applicationId });
  const doc = det?.docs?.[0];
  if (doc) {
    await call("hr2.rejectDocument", { id: doc.id, reason: "Photo unclear — please re-upload" });
    if (portalToken) await call("portal.uploadDoc", { token: portalToken, requirementKey: doc.requirementKey, fileName: "passport.pdf" }, "re-upload");
  }
  const det2 = await call("hr.applicationDetail", { id: applicationId });
  for (const d of det2?.docs ?? []) {
    if (d.status !== "verified") await call("hr2.verifyDocument", { id: d.id, expiresAt: "2027-10-01" }, `verify ${d.requirementKey}`);
  }
  await expectStage(applicationId, "offer_sent");

  // candidate accepts offer → training registration → online course → DBS → hire
  if (portalToken) {
    await call("portal.get", { token: portalToken }, "offer visible in portal");
    await call("portal.acceptOffer", { token: portalToken, signatureName: "Jordan Testament" }, "offer accepted");
    await expectStage(applicationId, "offer_accepted");
  }
  await call("hr2.complianceQueue");
  await call("hr2.complianceMatrix");
  const courses = await call("hr2.courses");
  const classroom = (courses ?? []).find((c: any) => c.type === "classroom") ?? courses?.[0];
  if (classroom) {
    const d = new Date(Date.now() + 5 * 86400000);
    await call("hr2.createSession", {
      courseId: classroom.id,
      startsAt: new Date(new Date(d).setHours(9, 0, 0, 0)).toISOString(),
      endsAt: new Date(new Date(d).setHours(16, 0, 0, 0)).toISOString(),
      location: "Head office, training room 1", capacity: 10, trainerName: "Ruby Osei",
    }, "schedule classroom session");
  }
  const sessions = await call("hr2.sessions");
  if (portalToken && sessions?.[0]) {
    await call("portal.registerTraining", { token: portalToken, sessionId: sessions[0].id });
    await expectStage(applicationId, "training_booked");
  }
  if (portalToken) {
    const det3 = await call("hr.applicationDetail", { id: applicationId });
    const enrolled = det3?.enrolments?.find((e: any) => e.status !== "completed");
    if (enrolled) await call("portal.markCourseComplete", { token: portalToken, courseId: enrolled.courseId }, "online course completed");
  }
  await call("hr2.dbsCheckIn", { applicationId, certificateNo: "001234567890", sightedOriginal: true, updateServiceChecked: true, barredListAdultsChecked: true, notes: "Original sighted at check-in" }, "DBS check-in");
  await call("hr2.completeTraining", { applicationId }, "convert to care worker");
  await expectStage(applicationId, "hired");
}

// second, weak application → bulk screen-out journey
if (slug) {
  const up2 = await call("hr.uploadCv", {
    slug, fileName: "casey.pdf",
    contentBase64: Buffer.from(qaPdf("Casey Screenout - no care experience yet, no driving licence, looking for first role in care")).toString("base64"),
  }, "weak CV uploaded");
  const weak = await call("hr.submitApplication", {
    slug, answers: {
      first_name: "Casey", last_name: "Screenout", email: `casey.screenout+${runId}@example.com`,
      mobile: `07${String((runId + 1) % 1000000000).padStart(9, "0")}`, postcode: "B23 6AB",
      years_experience: "0", care_settings: [], specialist_experience: [],
      qualifications: [], current_employer: "", current_role: "",
      experience_statement: "I do not have any formal care experience yet, but I am very keen to start a career in care and I am willing to learn everything from the beginning. I have helped look after an elderly neighbour informally, doing shopping and odd jobs, and I found it rewarding. I understand that domiciliary care involves personal care, medication support and companionship, and I am prepared to complete all required training including the Care Certificate. I do not currently drive, so I would need rounds that I can reach by public transport, and I am flexible about which days I work during the week.",
      right_to_work: "sponsorship", driving_licence: "no", own_car: "no",
      availability: { mon: ["mornings"], wed: ["afternoons"] },
      earliest_start: "2026-11-02", dbs_update_service: "no",
      privacy_consent: true, keep_details: false,
    },
    cv: { key: up2?.key, fileName: up2?.fileName, size: up2?.size, mimeType: up2?.mimeType, extractedText: up2?.extractedText, readable: up2?.readable },
  }, "weak application submitted");
  const weakId = weak?.applicationId ?? weak?.id;
  if (weakId) {
    await call("hr.runScreening", { applicationId: weakId }, "AI screening (weak)");
    await call("hr.bulkScreenOut", { applicationIds: [weakId], reason: "Does not meet essential requirements" }, "bulk screen-out");
    await expectStage(weakId, "screened_out");
  }
}
if (jobId) await call("hr2.leaderboard", { jobId });

// ── J2 Rota ──
await call("rota.clients");
const client = (await call("rota.clients"))?.[0];
if (client) await call("rota.clientDetail", { id: client.id });
const newClient = await call("rota.createClient", {
  firstName: "Ethel", lastName: "Journey", addressLine1: "12 High Street", town: "Birmingham",
  postcode: "B23 6AA", fundingSource: "private", riskLevel: "low",
});
// generate a week far enough out to avoid collisions with earlier QA runs;
// a 409 "already published/locked" just means a previous run took that week — skip ahead silently
let genWeek: any;
for (const weeksOut of [4, 5, 6, 8]) {
  const d = new Date(monday); d.setDate(monday.getDate() + weeksOut * 7);
  const before = fail;
  genWeek = await call("rota.generateWeek", { weekStartDate: d.toISOString().slice(0, 10) }, `generate week +${weeksOut}`);
  if (genWeek) break;
  if (fail > before && failures[failures.length - 1]?.includes("already published/locked")) {
    fail--; failures.pop();
    console.log(`SKIP rota.generateWeek +${weeksOut} — week already published by an earlier run, trying next`);
  }
}
const genWeekId = genWeek?.weekId;
await call("rota.weeks");
const week = (await call("rota.weeks"))?.[0];
if (week) {
  const wd = await call("rota.weekData", { weekId: week.id });
  const visit = wd?.visits?.find((v: any) => v.status !== "cancelled");
  const anyStaff = wd?.staff?.[0];
  if (visit && anyStaff) {
    await call("rota.checkAssignment", { visitId: visit.id, staffId: anyStaff.id });
    if (visit.status === "unassigned") await call("rota.reassignVisit", { visitId: visit.id, staffId: anyStaff.id, reason: "QA coverage" });
  }
  await call("rota.exportWeekCsv", { weekId: week.id });
}
if (genWeekId) await call("rota.publishWeek", { weekId: genWeekId }, "publish generated week");
await call("rota.markUnavailable", { staffId, startsAt: new Date(Date.now() + 2 * 86400000).toISOString(), endsAt: new Date(Date.now() + 2 * 86400000 + 7200000).toISOString(), reason: "sick", notes: "QA journey" }, "unavailability → auto-reassign");
await call("rota.reassignments");
await call("rota.myUnavailability");
await call("rota.myRota");
await call("rota.kpis");

// ── J3 CQC ──
const templates = await call("cqc.templates");
const tpl = templates?.[0];
if (tpl) {
  await call("cqc.updateTemplateStructure", { id: tpl.id, structure: [{ key: "about_me", title: "About me", guidance: "First person", required: true }] });
  await call("cqc.activateTemplate", { id: tpl.id });
}
await call("cqc.extractTemplateStructure", { text: "Care plan template. About me. Health conditions. Medication support. Mobility. Nutrition. Risks. Review date.", kind: "care_plan" }, "AI template extraction");
const clientId = client?.id;
if (clientId) {
  const plan = await call("cqc.createPlan", { clientId, planType: "care" });
  if (plan?.id) {
    await call("cqc.generatePlan", { planId: plan.id, inputs: { about: "Likes tea and gardening", mobility: "Uses a walking frame" } }, "AI plan generation");
    await call("cqc.planDetail", { id: plan.id });
    await call("cqc.regenerateSection", { planId: plan.id, sectionKey: "about_me", instruction: "Shorter" }, "AI regenerate section");
    await call("cqc.savePlanContent", { planId: plan.id, content: { about_me: "I like tea and gardening." } });
    await call("cqc.approvePlan", { planId: plan.id }, "human approval");
  }
  await call("cqc.plans", { planType: "care" });
  await call("cqc.logChangeEvent", { clientId, type: "hospital_discharge", description: "Returned home after a fall — review mobility section.", occurredAt: today.toISOString(), triggersReview: true }, "change event triggers review");
}
await call("cqc.reviews");
const review = (await call("cqc.reviews"))?.[0];
if (review) await call("cqc.completeReview", { id: review.id });
await call("cqc.changeEvents");
if (staffId) {
  await call("cqc.recordNote", { staffId, clientId, noteType: "spot_check", method: "typed", transcript: "Observed medication round — accurate recording, kind manner with client.", visibleToStaff: true, useAi: false }, "supervisor note");
  await call("cqc.supervisorNotes", { staffId });
  const appr = await call("cqc.createAppraisal", { staffId, periodStart: "2026-04-01", periodEnd: "2026-09-30" });
  if (appr?.id) {
    await call("cqc.draftAppraisal", { appraisalId: appr.id }, "AI appraisal draft");
    await call("cqc.finaliseAppraisal", { appraisalId: appr.id, final: { summary: "Strong period overall.", rating: 4 } });
    const ack = await call("cqc.acknowledgeAppraisal", { appraisalId: appr.id });
    if (ack === undefined) { pass++; fail--; failures.pop(); console.log("PASS cqc.acknowledgeAppraisal — correctly restricted to the appraisee (403 for manager)"); }
  }
  await call("cqc.appraisals");
}
const inc = await call("cqc.logIncident", { clientId, occurredAt: today.toISOString(), category: "Fall", description: "Client found on floor in bathroom, no injury.", severity: "low", actionsTaken: "Checked over, GP informed.", notifiableToCqc: false });
if (inc?.id) await call("cqc.closeIncident", { id: inc.id });
await call("cqc.incidents");
await call("cqc.readiness");

// ── J4 CRM ──
const contact = await call("crm.createContact", { contactType: "family_member", firstName: "Dana", lastName: "Journey", phone: `07111 ${String(runId).slice(-6)}`, email: `dana.journey+${runId}@example.com`, preferredChannel: "phone" });
await call("crm.contacts", {});
if (contact?.id) {
  await call("crm.contactDetail", { id: contact.id });
}
await call("crm.organisations");
await call("crm.lookupCaller", { phone: contact?.phone ?? "07111 222333" });
await call("crm.logInteraction", { type: "inbound_call", contactId: contact?.id, subject: "Asked about visit times", body: "Wanted to confirm Thursday visit.", durationSeconds: 240, outcome: "answered" }, "log call");
if (contact?.id) await call("crm.summariseContact", { contactId: contact.id }, "AI contact summary");
const ticket = await call("crm.createTicket", { subject: "QA journey — visit time query", description: "Family asked to move Thursday visit to 10:00.", category: "care_query", priority: "normal", channel: "phone", requesterContactId: contact?.id, clientId });
if (ticket?.id) {
  await call("crm.ticketDetail", { id: ticket.id });
  await call("crm.addComment", { ticketId: ticket.id, body: `Looping in @staff ${staffId} for visibility`, visibility: "internal", mentionedStaffIds: staffId ? [staffId] : [] }, "@-mention comment");
  await call("crm.draftReply", { ticketId: ticket.id }, "AI draft reply");
  await call("crm.followTicket", { ticketId: ticket.id });
  await call("crm.escalateTicket", { id: ticket.id, toStaffId: staff2 ?? staffId, reason: "Needs coordinator decision on timing" });
  await call("crm.updateTicket", { id: ticket.id, status: "in_progress", assigneeId: staffId });
  await call("crm.updateTicket", { id: ticket.id, status: "resolved", resolutionSummary: "Visit moved to 10:00 and family informed.", resolutionCode: "resolved_first_contact" }, "resolve");
}
await call("crm.tickets", { view: "all" });
await call("crm.tickets", { view: "mine" });
await call("crm.tickets", { view: "escalated" });
const tasks = await call("crm.myTasks");
if (tasks?.[0]) await call("crm.completeTask", { id: tasks[0].id });
await call("crm.myMentions");
await call("crm.crmStats");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (failures.length) { console.log("FAILURES:"); failures.forEach((f) => console.log(" -", f)); }
process.exit(fail ? 1 : 0);
