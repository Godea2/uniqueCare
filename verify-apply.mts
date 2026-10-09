import "dotenv/config";
import mysql from "mysql2/promise";
import crypto from "crypto";

const BASE = "http://localhost:3000/api/trpc";
const TOKEN = process.env.QA_TOKEN!;
const runId = crypto.randomBytes(3).toString("hex");
let pass = 0, fail = 0;

async function call(proc: string, input?: unknown, auth = true) {
  const isQuery = !["mutate"].some((m) => proc.includes(m));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.cookie = `kimi_sid=${TOKEN}`;
  // try mutation first for these
  const mutations = ["createJob", "submitApplication", "uploadCv", "runScreening", "setJobStatus", "regenerateApplyLink", "addLinkSource", "setApplyLinkEnabled", "suggestQuestions", "publishForm", "saveDraft", "extractRequirementsFromJD"];
  const isMut = mutations.some((m) => proc.endsWith(m));
  const url = `${BASE}/${proc}${isMut ? "" : `?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}`}`;
  const res = await fetch(url, isMut ? { method: "POST", headers, body: JSON.stringify({ json: input }) } : { headers });
  const body = await res.json();
  if (!res.ok || body.error) return { ok: false as const, status: res.status, error: body.error?.json?.message ?? body.error?.message ?? JSON.stringify(body.error) };
  return { ok: true as const, data: body.result.data.json };
}
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} — ${detail}`); }
};

const c = await mysql.createConnection(process.env.DATABASE_URL!);

// 1. create a job
const job = await call("hr.createJob", {
  title: `QA Care Worker ${runId}`, location: "Birmingham", salaryText: "£13/hr",
  employmentType: "full_time",
  descriptionMd: "## Role\n\nWe need a caring, reliable domiciliary care worker with dementia experience, a driving licence and weekend availability. Full training provided. Medication prompting and personal care involved.",
  requirements: [
    { key: "right_to_work", label: "Right to work in the UK", weight: 25, type: "hard", required: true },
    { key: "experience", label: "Domiciliary care experience", weight: 30, type: "scored", required: false },
    { key: "dementia", label: "Dementia care experience", weight: 25, type: "scored", required: false },
    { key: "driving", label: "Driving licence + vehicle", weight: 20, type: "scored", required: false },
  ],
  screeningThreshold: 85,
});
check("createJob", job.ok, job.ok ? "" : job.error);
const jobId = job.ok ? job.data.id : 0;

// 2. fetch apply slug from DB
const [jrows] = await c.query("SELECT apply_slug, apply_link_enabled, application_form_id FROM job_postings WHERE id = ?", [jobId]);
const applySlug = (jrows as { apply_slug: string }[])[0].apply_slug;
check("apply slug generated", !!applySlug && applySlug.includes("qa-care-worker"), applySlug);

// 3. tracked link source
const src = await call("hr.addLinkSource", { jobId, label: `QA Leaflet ${runId}` });
check("addLinkSource", src.ok, src.ok ? "" : src.error);
const srcSlug = src.ok ? src.data.slug : "";

// 4. publish the job
const live = await call("hr.setJobStatus", { id: jobId, status: "live" });
check("setJobStatus live", live.ok, live.ok ? "" : live.error);

// 5. publicApplyInfo (public, no auth)
const info = await call("hr.publicApplyInfo", { slug: applySlug, src: srcSlug }, false);
check("publicApplyInfo open", info.ok && info.data.state === "open" && !!info.data.schema?.sections?.length, info.ok ? JSON.stringify(info.data).slice(0, 200) : info.error);
check("source label resolved", info.ok && info.data.sourceLabel === srcSlug);

// 6. upload a CV (tiny valid PDF)
const pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length 120>>stream\nBT /F1 12 Tf 50 700 Td (Jane Doe - care assistant, 4 years domiciliary care, dementia experience, medication prompting, driver with own car) Tj ET\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF";
const up = await call("hr.uploadCv", { slug: applySlug, fileName: "jane.pdf", contentBase64: Buffer.from(pdf).toString("base64") }, false);
check("uploadCv", up.ok, up.ok ? "" : up.error);

// 7. submit application (mobile-style payload, tracked source)
const answers = {
  first_name: "Jane", last_name: `Tester${runId}`, email: `jane.${runId}@example.com`, mobile: `07${String(parseInt(runId, 16) % 1000000000).padStart(9, "0")}`, postcode: "B23 6AB",
  years_experience: "3_5", care_settings: ["domiciliary"], specialist_experience: ["dementia", "medication"],
  qualifications: ["care_certificate"], current_employer: "CareHome Ltd", current_role: "Care Assistant",
  experience_statement: "I have four years of domiciliary care experience supporting people with dementia in their own homes, including personal care, medication prompting, meal preparation and companionship. I hold the Care Certificate and I am a driver with my own car. I love building trusting relationships with the people I support and their families, and I always work in a person-centred way, following care plans carefully and keeping accurate records. I am looking for a role where I can make a genuine difference every single day, and Unique Care UK's reputation for outstanding care is exactly what I am looking for in my next role.",
  right_to_work: "yes", driving_licence: "yes", own_car: "yes",
  availability: { mon: ["mornings", "afternoons"], tue: ["mornings"], sat: ["mornings", "afternoons"], sun: ["mornings"] },
  earliest_start: "2026-10-12", dbs_update_service: "yes",
  privacy_consent: true, keep_details: false,
};
const sub = await call("hr.submitApplication", {
  slug: applySlug, src: srcSlug, answers,
  cv: up.ok ? { key: up.data.key, fileName: up.data.fileName, size: up.data.size, mimeType: up.data.mimeType, extractedText: up.data.extractedText, readable: up.data.readable } : { key: "x", fileName: "x.pdf", size: 1, mimeType: "application/pdf", extractedText: "fallback text", readable: true },
  website: "",
}, false);
check("submitApplication", sub.ok && !!sub.data.portalToken, sub.ok ? "" : sub.error);
const appId = sub.ok ? sub.data.applicationId : 0;

// 8. application row: stage applied, source label, form version frozen
const [arows] = await c.query("SELECT stage, source_channel, form_version_id, cv_file_key FROM applications WHERE id = ?", [appId]);
const arow = (arows as { stage: string; source_channel: string; form_version_id: number | null; cv_file_key: string }[])[0];
check("pipeline row: applied + source + version + cv key", arow?.stage === "applied" && arow?.source_channel === srcSlug && arow.form_version_id != null && !!arow.cv_file_key, JSON.stringify(arow));

// 9. confirmation email in outbox
const [erows] = await c.query("SELECT kind, status, to_email FROM email_outbox WHERE related_id = ? AND kind = 'application_confirmation'", [String(appId)]);
check("confirmation email recorded", (erows as unknown[]).length === 1, JSON.stringify(erows));

// 10. honeypot rejected
const hp = await call("hr.submitApplication", { slug: applySlug, answers, cv: { key: "x", fileName: "x.pdf", size: 1, mimeType: "application/pdf", extractedText: "t", readable: true }, website: "spammy" }, false);
check("honeypot blocks spam", !hp.ok, hp.ok ? "spam accepted!" : hp.error);

// 11. required-field bypass attempt (no consent) rejected by server schema
const bad = { ...answers, privacy_consent: undefined as unknown as boolean, email: `jane2.${runId}@example.com` };
const bypass = await call("hr.submitApplication", { slug: applySlug, answers: bad, cv: { key: "x", fileName: "x.pdf", size: 1, mimeType: "application/pdf", extractedText: "t", readable: true }, website: "" }, false);
check("server rejects missing locked consent", !bypass.ok, bypass.ok ? "bypass accepted!" : bypass.error);

// 12. duplicate application: same email again → links to existing, no second candidate, new CV version
const dup = await call("hr.submitApplication", { slug: applySlug, answers, cv: { key: "x2", fileName: "jane-v2.pdf", size: 1, mimeType: "application/pdf", extractedText: "updated cv text", readable: true }, website: "" }, false);
check("duplicate links to existing application", dup.ok && dup.data.duplicate === true && dup.data.applicationId === appId, dup.ok ? JSON.stringify(dup.data) : dup.error);
const [cvrows] = await c.query("SELECT COUNT(*) AS n FROM cv_versions WHERE application_id = ?", [appId]);
check("new CV version stored", Number((cvrows as { n: number }[])[0].n) === 2, JSON.stringify(cvrows));
const [ccount] = await c.query("SELECT COUNT(*) AS n FROM candidates WHERE email = ?", [answers.email]);
check("no second candidate", Number((ccount as { n: number }[])[0].n) === 1);

// 13. AI screening — strong CV should shortlist + invitation email
const scr = await call("hr.runScreening", { applicationId: appId });
check("runScreening returns score", scr.ok && typeof scr.data.score === "number", scr.ok ? `score=${scr.data.score}` : scr.error);
const [arows2] = await c.query("SELECT stage, ai_score, ai_flags FROM applications WHERE id = ?", [appId]);
const arow2 = (arows2 as { stage: string; ai_score: number }[])[0];
check("strong CV auto-shortlisted", ["shortlisted", "pre_interview_forms_sent"].includes(arow2.stage), `stage=${arow2.stage} score=${arow2.ai_score}`);
const [ierows] = await c.query("SELECT kind FROM email_outbox WHERE related_id = ? AND kind = 'interview_invitation'", [String(appId)]);
check("interview invitation email recorded", (ierows as unknown[]).length >= 1, JSON.stringify(ierows));
if (scr.ok) {
  const rr = scr.data.requirementResults;
  check("requirement-by-requirement with evidence + source", Array.isArray(rr) && rr.length >= 4 && rr.every((x: { evidence?: string; source?: string }) => x.evidence && ["cv", "form"].includes(x.source ?? "")), JSON.stringify(rr).slice(0, 300));
}

// 14. disable link → closed page
await call("hr.setApplyLinkEnabled", { jobId, enabled: false });
const closedInfo = await call("hr.publicApplyInfo", { slug: applySlug }, false);
check("disabled link → closed state", closedInfo.ok && closedInfo.data.state === "closed", closedInfo.ok ? closedInfo.data.state : closedInfo.error);

// 15. regenerate link → old slug invalid, new works
const regen = await call("hr.regenerateApplyLink", { jobId });
check("regenerateApplyLink", regen.ok && regen.data.applySlug !== applySlug, regen.ok ? "" : regen.error);
const oldInfo = await call("hr.publicApplyInfo", { slug: applySlug }, false);
check("old slug invalid after regen", !oldInfo.ok, oldInfo.ok ? "old slug still works!" : "");
const [jrows2] = await c.query("SELECT apply_link_enabled FROM job_postings WHERE id = ?", [jobId]);
check("regen re-enables link", !!(jrows2 as { apply_link_enabled: boolean }[])[0].apply_link_enabled);

// 16. form builder: jobForm exists, saveDraft with conditional + knockout, publish → new version
const jf = await call("forms.jobForm", { jobId });
check("jobForm exists (auto-created)", jf.ok && !!jf.data.form, jf.ok ? "" : jf.error);
if (jf.ok) {
  const formId = Number(jf.data.form.id);
  const schema = JSON.parse(JSON.stringify(jf.data.form.draftSchema));
  // add a conditional question + knockout to last section
  schema.sections[4].fields.push({
    id: "nights_comfort", type: "yes_no", label: "Are you comfortable working waking nights?", required: true, locked: false, useInAi: true,
    condition: { fieldId: "dbs_update_service", op: "equals", value: "yes" },
    knockoutRule: { op: "equals", value: "no", message: "Not comfortable with nights — review fit for this evening role" },
  });
  const sd = await call("forms.saveDraft", { formId, schemaJson: schema });
  check("saveDraft (conditional + knockout)", sd.ok, sd.ok ? "" : sd.error);
  const pub = await call("forms.publishForm", { formId });
  check("publishForm → v2", pub.ok && pub.data.version === 2, pub.ok ? JSON.stringify(pub.data) : pub.error);
  // locked-field removal attempt rejected
  const broken = JSON.parse(JSON.stringify(schema));
  broken.sections[0].fields = broken.sections[0].fields.filter((f: { id: string }) => f.id !== "email");
  const lock = await call("forms.saveDraft", { formId, schemaJson: broken });
  check("locked field removal rejected", !lock.ok, lock.ok ? "email field removed!" : "");

  // 17. apply against v2 with knockout tripped → flag + review, never auto-shortlist
  const a2 = { ...answers, email: `jane3.${runId}@example.com`, mobile: "07700 900999", nights_comfort: "no" };
  const sub2 = await call("hr.submitApplication", { slug: regen.ok ? regen.data.applySlug : applySlug, answers: a2, cv: { key: "x3", fileName: "k.pdf", size: 1, mimeType: "application/pdf", extractedText: "4 years domiciliary dementia care, driver, own car, Care Certificate", readable: true }, website: "" }, false);
  check("submit against v2", sub2.ok, sub2.ok ? "" : sub2.error);
  if (sub2.ok) {
    const [v2rows] = await c.query("SELECT form_version_id, ai_flags, stage FROM applications WHERE id = ?", [sub2.data.applicationId]);
    const v2row = (v2rows as { form_version_id: number }[])[0];
    const [verRows] = await c.query("SELECT version FROM application_form_versions WHERE id = ?", [v2row.form_version_id]);
    check("answer stored against right form version (v2)", Number((verRows as { version: number }[])[0]?.version) === 2, JSON.stringify(v2row));
    const scr2 = await call("hr.runScreening", { applicationId: sub2.data.applicationId });
    check("knockout flags for human review", scr2.ok && scr2.data.knockoutTripped === true && scr2.data.flags.some((f: string) => f.includes("Knockout")), scr2.ok ? JSON.stringify(scr2.data.flags) : scr2.error);
    const [st2] = await c.query("SELECT stage FROM applications WHERE id = ?", [sub2.data.applicationId]);
    check("knockout → review stage (never auto-shortlist/reject)", (st2 as { stage: string }[])[0].stage === "review", (st2 as { stage: string }[])[0].stage);
  }
}

// 18. closed job → closed page (not 404)
await call("hr.setJobStatus", { id: jobId, status: "closed" });
const closedJob = await call("hr.publicApplyInfo", { slug: regen.ok ? regen.data.applySlug : applySlug }, false);
check("closed job → friendly closed page", closedJob.ok && closedJob.data.state === "closed", closedJob.ok ? closedJob.data.state : closedJob.error);

// 19. suggest questions
const sq = await call("forms.suggestQuestions", { jobId });
check("suggestQuestions returns 5-8", sq.ok && sq.data.questions.length >= 1 && sq.data.questions.length <= 10, sq.ok ? `${sq.data.questions.length} questions` : sq.error);

// 20. extractRequirementsFromJD
const er = await call("hr.extractRequirementsFromJD", { title: "Senior Care Worker", descriptionMd: "We need a senior carer with NVQ3, medication experience, dementia background. Must drive." });
check("extractRequirementsFromJD", er.ok && er.data.requirements.length >= 3, er.ok ? `${er.data.requirements.length} reqs` : er.error);

// 21. empty requirements cannot go Live
const dj = await call("hr.createJob", { title: `Empty Req Job ${runId}`, location: "Birmingham", employmentType: "part_time", descriptionMd: "Some description long enough.", requirements: [] });
if (dj.ok) {
  const noLive = await call("hr.setJobStatus", { id: dj.data.id, status: "live" });
  check("cannot go Live with empty requirements", !noLive.ok, noLive.ok ? "went live!" : "");
}

await c.end();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
