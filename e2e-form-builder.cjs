/* Playwright E2E: customise form (conditional question + knockout) → publish → apply →
   answer stored against the right form version → knockout flags for human review. */
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = "http://localhost:3000";
const TOKEN = process.argv[2];
const runId = Date.now().toString(36);

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; failures.push(name + (extra ? ` :: ${extra}` : "")); console.log(`FAIL ${name} ${extra}`); }
}

async function trpc(proc, input, cookie) {
  const QUERIES = new Set(["jobs", "publicJobs", "pipeline", "applicationDetail", "publicApplyInfo", "jobForm"]);
  const isQuery = QUERIES.has(proc.split(".")[1]);
  const headers = { "content-type": "application/json", cookie: `kimi_sid=${cookie}` };
  const r = isQuery
    ? await fetch(`${BASE}/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, { headers })
    : await fetch(`${BASE}/api/trpc/${proc}`, { method: "POST", headers, body: JSON.stringify({ json: input }) });
  const body = await r.json();
  if (body.error) throw new Error(`${proc}: ${JSON.stringify(body.error.json?.message ?? body.error).slice(0, 200)}`);
  return body.result?.data?.json;
}

const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length 120>>stream\nBT /F1 12 Tf 50 700 Td (Ben E2E - care worker, 2 years domiciliary care experience, medication prompts, driver) Tj ET\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
const CV_PATH = require("path").join(__dirname, "e2e-cv.pdf");
fs.writeFileSync(CV_PATH, pdf);

const STATEMENT = "I have two years of domiciliary care experience supporting older people in their own homes, including personal care, medication prompting, meal preparation and companionship calls. I hold the Care Certificate and I am a driver with my own car, happy to cover rounds across the local area. I take time to build trusting relationships with the people I support and their families, I follow care plans carefully, keep accurate visit records and always raise concerns promptly with my line manager. I am now looking for a role with an employer that invests in training and genuinely puts people first, and Unique Care UK's values are exactly what I am looking for in my next role.";

(async () => {
  // ── setup: a live job (API) so the test can focus on the builder journey ──
  const title = `E2E Builder Job ${runId}`;
  const job = await trpc("hr.createJob", {
    title, location: "Birmingham", salaryText: "£12.85 per hour", employmentType: "full_time",
    descriptionMd: "## Care Worker\n\nDomiciliary care visits across Birmingham — personal care, medication prompts, companionship.",
    requirements: [
      { key: "rtw", label: "Right to work in the UK", weight: 40, type: "scored", required: true },
      { key: "exp", label: "1+ year care experience", weight: 60, type: "scored", required: false },
    ],
    screeningThreshold: 85,
  }, TOKEN);
  const jobId = job.id;
  await trpc("hr.setJobStatus", { id: jobId, status: "live" }, TOKEN);
  const jobs = await trpc("hr.jobs", undefined, TOKEN);
  const slug = jobs.find((j) => Number(j.id) === Number(jobId))?.applySlug;
  check("live job with apply link (setup)", !!slug);

  const browser = await chromium.launch();
  const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await admin.addCookies([{ name: "kimi_sid", value: TOKEN, url: BASE }]);
  const page = await admin.newPage();

  // ── 1. open the job's Application form tab ──
  await page.goto(`${BASE}/recruitment/forms?job=${jobId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add section" }).waitFor({ timeout: 15000 });
  check("form builder opens with auto-created form", true);
  check("locked core fields shown with lock icons",
    (await page.locator('[aria-label="Locked core field"]').count()) >= 6);

  // ── 2. add a conditional knockout question ──
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("button", { name: "Yes / No", exact: true }).click();
  await page.waitForTimeout(500);

  const settings = page.locator(".uc-card", { hasText: "Field settings" }).last();
  await settings.locator("input").first().fill("Are you comfortable working night shifts?");

  // conditional: show only if DBS Update Service = yes
  await settings.locator('button[role="combobox"]').first().click();
  await page.getByRole("option", { name: /DBS Update Service/ }).click();
  await settings.getByPlaceholder("value").first().fill("yes");

  // knockout: answer "no" flags for human review
  await settings.locator('button[role="combobox"]', { hasText: "None" }).click();
  await page.getByRole("option", { name: "When answer…" }).click();
  await settings.getByPlaceholder("value").last().fill("no");
  await settings.getByPlaceholder("Flag message shown to reviewers").fill("Not comfortable with nights — flag for human review");
  check("conditional + knockout configured", true);

  // locked field cannot be deleted
  const delBtns = page.locator('button[aria-label="Delete field"]');
  const disabledCount = await delBtns.evaluateAll((els) => els.filter((e) => e.disabled).length);
  check("locked fields have delete disabled", disabledCount >= 6, `${disabledCount} disabled`);

  // ── 3. publish → version 2 ──
  await page.getByRole("button", { name: "Publish form changes" }).click();
  await page.getByText(/Published: v2/).waitFor({ timeout: 20000 });
  check("publish creates version 2", true);

  // ── 4. apply on mobile against the new version ──
  const mobile = await browser.newContext({
    viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const m = await mobile.newPage();
  await m.goto(`${BASE}/apply/${slug}`, { waitUntil: "networkidle" });
  await m.getByRole("heading", { name: title }).waitFor({ timeout: 15000 });

  await m.locator("#f-first_name").fill("Ben");
  await m.locator("#f-last_name").fill(`Builder${runId}`);
  await m.locator("#f-email").fill(`ben.${runId}@example.com`);
  await m.locator("#f-mobile").fill(`07${String((Date.now() + 7) % 1000000000).padStart(9, "0")}`);
  await m.locator("#f-postcode").fill("B23 6AB");
  await m.getByRole("button", { name: "Continue" }).click();

  await m.locator('input[type="file"]').setInputFiles(CV_PATH);
  await m.getByText("ready to submit").waitFor({ timeout: 20000 });
  await m.getByRole("button", { name: "Continue" }).click();

  await m.locator('button[role="combobox"]').first().click();
  await m.getByRole("option", { name: "1–2 years" }).click();
  await m.getByText("Domiciliary / home care").click();
  await m.getByText("Care Certificate", { exact: true }).click();
  await m.locator("textarea").fill(STATEMENT);
  await m.getByRole("button", { name: "Continue" }).click();

  await m.locator('button[role="combobox"]').first().click();
  await m.getByRole("option", { name: "Yes", exact: true }).click();
  await m.locator("fieldset", { hasText: "driving licence" }).getByRole("button", { name: "Yes" }).click();
  await m.locator("fieldset", { hasText: "access to a car" }).getByRole("button", { name: "Yes" }).click();
  await m.getByRole("button", { name: /Mon Mornings: not available/ }).click();
  await m.locator("#f-earliest_start").fill("2026-10-19");
  await m.locator("fieldset", { hasText: "DBS Update Service" }).getByRole("button", { name: "Yes" }).click();
  await m.getByRole("button", { name: "Continue" }).click();

  await m.getByRole("button", { name: "Continue" }).click(); // role questions (empty)

  // the conditional question is the last step — visible because DBS = yes
  await m.getByText("I consent to Unique Care UK processing my personal data").click();
  await m.getByRole("button", { name: "Continue" }).click();
  const nights = m.locator("fieldset", { hasText: "night shifts" });
  check("conditional question shown when condition met", await nights.isVisible());
  await nights.getByRole("button", { name: "No" }).click(); // trips the knockout
  await m.getByRole("button", { name: "Submit application" }).click();
  await m.getByRole("heading", { name: "Application received" }).waitFor({ timeout: 20000 });
  check("submission accepted (knockout never blocks submitting)", true);

  // ── 5. verify version + knockout handling ──
  const form = await trpc("forms.jobForm", { jobId }, TOKEN);
  const publishedV = form?.published?.version ?? form?.form?.publishedVersion?.version;
  const pipe = await trpc("hr.pipeline", {}, TOKEN);
  const appRow = pipe.find((a) => a.candidate?.email === `ben.${runId}@example.com`);
  const det = await trpc("hr.applicationDetail", { id: appRow.id }, TOKEN);
  check("answer stored against form version 2",
    Number(det?.application?.formVersionId) === Number(form?.form?.publishedVersionId) && Number(publishedV) === 2,
    `formVersionId=${det?.application?.formVersionId} published=${form?.form?.publishedVersionId}`);
  const koField = (det?.formSchema?.sections ?? []).flatMap((s) => s.fields).find((f) => f.knockoutRule && /night/i.test(f.label));
  const answers = det?.application?.answers ?? {};
  check("knockout answer stored", !!koField && answers[koField.id] === "no", JSON.stringify(answers).slice(0, 200));

  const screened = await trpc("hr.runScreening", { applicationId: appRow.id }, TOKEN);
  check("knockout flags for human review", screened?.knockoutTripped === true
    && (screened?.flags ?? []).some((f) => /nights/i.test(f)), JSON.stringify(screened?.flags));
  const det2 = await trpc("hr.applicationDetail", { id: appRow.id }, TOKEN);
  check("knockout → review stage (never auto-shortlist/reject)", det2?.application?.stage === "review", det2?.application?.stage);

  await browser.close();
  fs.rmSync(CV_PATH, { force: true });
  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  if (failures.length) { console.log("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
})().catch((e) => { console.error("E2E crashed:", e.message); process.exit(1); });
