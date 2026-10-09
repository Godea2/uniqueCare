/* Playwright E2E: create job → copy link → apply on mobile with CV → scored and shortlisted. */
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
  const QUERIES = new Set(["jobs", "publicJobs", "pipeline", "applicationDetail", "publicApplyInfo"]);
  const isQuery = QUERIES.has(proc.split(".")[1]);
  const headers = { "content-type": "application/json", cookie: `kimi_sid=${cookie}` };
  const r = isQuery
    ? await fetch(`${BASE}/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, { headers })
    : await fetch(`${BASE}/api/trpc/${proc}`, { method: "POST", headers, body: JSON.stringify({ json: input }) });
  const body = await r.json();
  if (body.error) throw new Error(`${proc}: ${JSON.stringify(body.error.json?.message ?? body.error).slice(0, 200)}`);
  return body.result?.data?.json;
}

const CV_TEXT = "Amara E2E - senior care worker, 6 years domiciliary care, dementia and medication experience, full UK driving licence, own car, Care Certificate and NVQ Level 3";
const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length 120>>stream\nBT /F1 12 Tf 50 700 Td (${CV_TEXT}) Tj ET\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
const CV_PATH = require("path").join(__dirname, "e2e-cv.pdf");
fs.writeFileSync(CV_PATH, pdf);

const STATEMENT = "I have six years of domiciliary care experience supporting people with dementia in their own homes, including personal care, medication prompting, meal preparation and companionship. I hold the Care Certificate and NVQ Level 3 in Health and Social Care, and I am a driver with my own car. I build trusting relationships with the people I support and their families, always working in a person-centred way, following care plans carefully and keeping accurate records at every visit. I am looking for a role where I can make a genuine difference every day, and Unique Care UK's reputation for outstanding care is exactly what I want in my next role.";

(async () => {
  const browser = await chromium.launch();
  const admin = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await admin.addCookies([{ name: "kimi_sid", value: TOKEN, url: BASE }]);
  const page = await admin.newPage();
  const title = `E2E Care Worker ${runId}`;

  // ── 1. create job through the UI ──
  await page.goto(`${BASE}/recruitment/jobs`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "New job" }).click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator("#j-title").fill(title);
  await dialog.locator("#j-loc").fill("Birmingham");
  await dialog.locator("#j-sal").fill("£13.00 per hour");
  await dialog.locator("#j-desc").fill("## Care Worker\n\nJoin Unique Care UK supporting people in their own homes across Birmingham. Personal care, medication prompts and companionship visits. Driver with own car essential.");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog.locator('input[aria-label="Requirement 1"]').fill("Right to work in the UK");
  await dialog.locator('input[aria-label="Weight"]').first().fill("40");
  await dialog.locator('input[type="checkbox"]').first().check();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog.locator('input[aria-label="Requirement 2"]').fill("1+ year domiciliary care experience");
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await page.waitForTimeout(2500);

  const card = page.locator(".uc-card").filter({ hasText: title }).first();
  await card.waitFor({ timeout: 15000 });
  check("job created via UI", true);

  // ── 2. publish + application link card ──
  await card.getByRole("button", { name: "Publish to careers page" }).click();
  await page.waitForTimeout(2000);
  const linkCode = card.locator("code").first();
  const applyUrlText = (await linkCode.textContent())?.trim() ?? "";
  check("apply link shown", applyUrlText.includes("/apply/"), applyUrlText);

  await card.getByRole("button", { name: "Copy application link" }).click();
  await page.waitForTimeout(500);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  check("copy link to clipboard", clip === applyUrlText, clip);

  await card.getByRole("button", { name: "Download QR code" }).first().click();
  check("QR menu offers PNG and SVG", await page.getByRole("button", { name: "Download PNG" }).isVisible()
    && await page.getByRole("button", { name: "Download SVG" }).isVisible());
  await page.keyboard.press("Escape");

  // tracked variant
  await card.getByPlaceholder(/Label, e\.g\./).fill("Facebook QA");
  await card.getByRole("button", { name: "Add tracked link" }).click();
  await page.waitForTimeout(2000);
  check("tracked link added", await card.getByText("Facebook QA", { exact: true }).first().isVisible());

  const slug = applyUrlText.split("/apply/")[1];
  const mobileUrl = `${BASE}/apply/${slug}?src=facebook-qa`;

  // ── 3. apply on a phone ──
  const mobile = await browser.newContext({
    viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const m = await mobile.newPage();
  await m.goto(mobileUrl, { waitUntil: "networkidle" });
  await m.getByRole("heading", { name: title }).waitFor({ timeout: 15000 });
  check("mobile form loads with job header", true);

  // step 1: about you
  await m.locator("#f-first_name").fill("Amara");
  await m.locator("#f-last_name").fill(`E2E${runId}`);
  await m.locator("#f-email").fill(`amara.${runId}@example.com`);
  await m.locator("#f-mobile").fill(`07${String(Date.now() % 1000000000).padStart(9, "0")}`);
  await m.locator("#f-postcode").fill("B23 6AB");
  await m.getByRole("button", { name: "Continue" }).click();

  // step 2: CV upload
  await m.locator('input[type="file"]').setInputFiles(CV_PATH);
  await m.getByText("ready to submit").waitFor({ timeout: 20000 });
  check("CV uploaded from phone", true);
  await m.getByRole("button", { name: "Continue" }).click();

  // step 3: experience
  await m.locator('button[role="combobox"]').first().click();
  await m.getByRole("option", { name: "3–5 years" }).click();
  await m.getByText("Domiciliary / home care").click();
  await m.getByText("Dementia care").click();
  await m.getByText("Care Certificate", { exact: true }).click();
  await m.locator("textarea").fill(STATEMENT);
  await m.getByRole("button", { name: "Continue" }).click();

  // step 4: practical details
  await m.locator('button[role="combobox"]').first().click();
  await m.getByRole("option", { name: "Yes", exact: true }).click();
  await m.locator("fieldset", { hasText: "driving licence" }).getByRole("button", { name: "Yes" }).click();
  await m.locator("fieldset", { hasText: "access to a car" }).getByRole("button", { name: "Yes" }).click();
  await m.getByRole("button", { name: /Sat Mornings: not available/ }).click();
  await m.getByRole("button", { name: /Sun Mornings: not available/ }).click();
  await m.locator("#f-earliest_start").fill("2026-10-12");
  await m.locator("fieldset", { hasText: "DBS Update Service" }).getByRole("button", { name: "Yes" }).click();
  await m.getByRole("button", { name: "Continue" }).click();

  // step 5: role questions (empty on the default template)
  await m.getByRole("button", { name: "Continue" }).click();

  // step 6: consent → submit
  await m.getByText("I consent to Unique Care UK processing my personal data").click();
  await m.getByRole("button", { name: "Submit application" }).click();
  await m.getByRole("heading", { name: "Application received" }).waitFor({ timeout: 20000 });
  check("mobile submission → thank-you page", true);

  // ── 4. admin side: source stats + AI screening → shortlist ──
  const jobs = await trpc("hr.jobs", undefined, TOKEN);
  const job = jobs.find((j) => j.title === title);
  check("application counted under tracked source", (job?.applicationsBySource?.["facebook-qa"] ?? 0) === 1,
    JSON.stringify(job?.applicationsBySource));

  const pipe = await trpc("hr.pipeline", {}, TOKEN);
  const appRow = pipe.find((a) => a.candidate?.email === `amara.${runId}@example.com`);
  check("application in pipeline as Applied", appRow?.stage === "applied", appRow?.stage);

  // open the candidate in the UI and run screening from there
  await page.goto(`${BASE}/recruitment/pipeline/${appRow.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Re-score|Run AI screening|Score/ }).first().click();

  // AI scoring can take a while — poll the API until the score lands
  let det;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(4000);
    det = await trpc("hr.applicationDetail", { id: appRow.id }, TOKEN);
    if (det?.application?.aiScore != null) break;
  }
  check("AI score produced", det?.application?.aiScore != null, JSON.stringify(det?.application?.aiScore));
  check("score meets auto-shortlist bar (≥85)", Number(det?.application?.aiScore) >= 85, String(det?.application?.aiScore));
  check("strong CV auto-shortlisted", ["pre_interview_forms_sent", "shortlisted"].includes(det?.application?.stage), det?.application?.stage);
  const rr = Array.isArray(det?.application?.aiBreakdown) ? det.application.aiBreakdown : (det?.application?.aiBreakdown?.requirement_results ?? []);
  check("requirement-by-requirement breakdown with evidence",
    rr.length >= 2 && rr.every((r) => r.evidence && r.met), JSON.stringify(rr).slice(0, 200));

  await page.reload({ waitUntil: "networkidle" });
  check("score visible on candidate page", await page.getByText(String(det.application.aiScore), { exact: false }).first().isVisible());

  await browser.close();
  fs.rmSync(CV_PATH, { force: true });
  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  if (failures.length) { console.log("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
})().catch((e) => { console.error("E2E crashed:", e.message); process.exit(1); });
