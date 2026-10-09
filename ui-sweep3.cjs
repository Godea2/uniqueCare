/* UI sweep 3: open-and-close every primary action dialog (non-destructive). */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const TOKEN = process.argv[2];

const cases = [
  { route: "/recruitment/jobs", buttons: [/new job|create job|post job|add job/i] },
  { route: "/recruitment/interviews", buttons: [/new slot|add slot|create slot/i] },
  { route: "/recruitment/training", buttons: [/new session/i] },
  { route: "/staff/supervision", buttons: [/record note|new note|add note/i] },
  { route: "/staff/appraisals", buttons: [/new appraisal|create appraisal|start appraisal/i] },
  { route: "/clients", buttons: [/new client|add client|register client/i] },
  { route: "/clients/change-events", buttons: [/log|new event|add event|record/i] },
  { route: "/crm/tickets", buttons: [/new ticket|create ticket|log ticket/i] },
  { route: "/crm/contacts", buttons: [/new contact|add contact/i] },
  { route: "/cqc/incidents", buttons: [/log incident|new incident|record incident/i] },
  { route: "/cqc", buttons: [/inspection pack/i], expectDialog: false },
  { route: "/settings", buttons: [/save organisation/i], expectDialog: false },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "kimi_sid", value: TOKEN, url: BASE }]);
  const page = await ctx.newPage();

  let pass = 0, fail = 0;
  for (const c of cases) {
    const errors = [];
    const onPageErr = (e) => errors.push("pageerror: " + String(e).slice(0, 160));
    page.on("pageerror", onPageErr);
    try {
      await page.goto(BASE + c.route, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1200);
      let found = false;
      for (const re of c.buttons) {
        const btn = page.locator("button", { hasText: re }).first();
        if (await btn.count()) {
          found = true;
          if (c.expectDialog === false) break;
          await btn.click();
          await page.waitForTimeout(700);
          const dialog = page.locator("[role='dialog'], [data-slot='dialog-content'], .uc-card form, form").first();
          const dialogVisible = await dialog.count() && await dialog.isVisible().catch(() => false);
          const popover = page.locator("[data-slot='popover-content'], [role='dialog']").first();
          const anyOverlay = dialogVisible || (await popover.count() && await popover.isVisible().catch(() => false));
          if (!anyOverlay) errors.push(`clicked "${await btn.textContent()}" but no dialog/form appeared`);
          await page.keyboard.press("Escape");
          await page.waitForTimeout(300);
          break;
        }
      }
      if (!found) errors.push("no primary action button matching " + c.buttons.map(String).join(", "));
    } catch (e) { errors.push("nav: " + String(e).slice(0, 140)); }
    page.off("pageerror", onPageErr);
    if (errors.length) { fail++; console.log(`FAIL ${c.route}`); errors.forEach((e) => console.log("   " + e)); }
    else { pass++; console.log(`OK   ${c.route}`); }
  }
  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
