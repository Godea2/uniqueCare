/* UI sweep part 2: detail pages + key interactive controls. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const TOKEN = process.argv[2];

const detailRoutes = [
  "/recruitment/pipeline/14",         // offer-accepted candidate — full journey detail
  "/clients/1",                       // client detail
  "/clients/plans/8",                 // plan editor (in_review)
  "/crm/tickets/1",                   // ticket detail
  "/crm/contacts/1",                  // contact detail
  "/apply/domiciliary-care-worker-erdington-yardley-1b8aqw", // public apply form
  "/portal/93np0kbwc1t7dtyttyhy", // candidate portal (offer accepted)
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "kimi_sid", value: TOKEN, url: BASE }]);
  const page = await ctx.newPage();

  let problems = 0;
  const check = async (route, extra) => {
    const errors = [];
    const onConsole = (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); };
    const onPageErr = (e) => errors.push("pageerror: " + String(e).slice(0, 200));
    const onResp = (r) => { if (r.status() >= 500) errors.push(`http ${r.status()}: ${r.url().slice(0, 140)}`); };
    page.on("console", onConsole); page.on("pageerror", onPageErr); page.on("response", onResp);
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1500);
      const bodyText = (await page.textContent("body"))?.trim() ?? "";
      if (bodyText.length < 30) errors.push("near-empty page");
      if (extra) await extra(page, errors);
    } catch (e) { errors.push("nav: " + String(e).slice(0, 160)); }
    page.off("console", onConsole); page.off("pageerror", onPageErr); page.off("response", onResp);
    if (errors.length) { problems++; console.log(`FAIL ${route}`); errors.forEach((e) => console.log("   " + e)); }
    else console.log(`OK   ${route}`);
  };

  for (const r of detailRoutes) await check(r);

  await check("/", async (p) => {
    const searchBtn = p.locator("button", { hasText: /search/i }).first();
    if (await searchBtn.count()) { await searchBtn.click(); await p.waitForTimeout(400); await p.keyboard.press("Escape"); }
  });

  await check("/rota", async (p, errors) => {
    const tabs = p.locator("[role='tablist'][aria-label='Rota weeks'] [role='tab']");
    const n = await tabs.count();
    if (n < 2) { errors.push(`only ${n} week tabs — cannot verify switching`); return; }
    const first = await tabs.nth(0).textContent();
    await tabs.nth(1).click(); await p.waitForTimeout(1500);
    const selected = await p.locator("[role='tablist'][aria-label='Rota weeks'] [role='tab'][aria-selected='true']").textContent();
    if ((selected ?? "").trim() === (first ?? "").trim()) errors.push("week tab switch did not change selection");
  });

  await check("/me", async (p) => {
    const trigger = p.locator("[data-slot='select-trigger'], select").first();
    if (await trigger.count()) {
      await trigger.click(); await p.waitForTimeout(500);
      const opt = p.locator("[data-slot='select-item'], option").nth(1);
      if (await opt.count()) { await opt.click(); await p.waitForTimeout(1200); }
    }
  });

  await check("/crm/tickets", async (p, errors) => {
    const tab = p.locator("button, [role='tab']", { hasText: /mine|escalated/i }).first();
    if (await tab.count()) { await tab.click(); await p.waitForTimeout(1200); }
    else errors.push("no ticket view tabs found");
  });

  await check("/recruitment/pipeline", async (p, errors) => {
    const card = p.locator("a[href^='/recruitment/pipeline/']").first();
    if (await card.count()) {
      await card.click(); await p.waitForTimeout(1500);
      if (!p.url().match(/\/recruitment\/pipeline\/\d+/)) errors.push("pipeline card did not navigate to candidate detail");
    } else errors.push("no candidate cards in pipeline");
  });

  await check("/clients/plans/8", async (p, errors) => {
    const approve = p.locator("button", { hasText: /approve|generate|save/i }).first();
    if (!(await approve.count())) errors.push("no action buttons in plan editor");
  });

  console.log(`\n===== ${detailRoutes.length + 6 - problems}/${detailRoutes.length + 6} checks clean =====`);
  await browser.close();
  process.exit(problems ? 1 : 0);
})();
