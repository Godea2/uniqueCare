/* UI sweep: visit every route, capture console/page errors and failed API calls. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const TOKEN = process.argv[2];

const routes = [
  "/login", "/careers", "/apply/domiciliary-care-worker-erdington-yardley-1b8aqw",
  "/", "/recruitment/jobs", "/recruitment/forms", "/recruitment/pipeline", "/recruitment/interviews",
  "/recruitment/compliance", "/recruitment/training",
  "/staff", "/staff/compliance", "/staff/supervision", "/staff/appraisals",
  "/clients", "/clients/care-plans", "/clients/support-plans", "/clients/reviews", "/clients/change-events",
  "/rota", "/rota/reassignments", "/me",
  "/crm/tickets", "/crm/contacts", "/crm/tasks", "/crm/reports",
  "/cqc", "/cqc/incidents", "/cqc/inspection-pack",
  "/settings", "/audit", "/home",
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "kimi_sid", value: TOKEN, url: BASE }]);
  const page = await ctx.newPage();

  let problems = 0;
  for (const route of routes) {
    const errors = [];
    const onConsole = (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); };
    const onPageErr = (e) => errors.push("pageerror: " + String(e).slice(0, 200));
    const onResp = (r) => { if (r.status() >= 500 && !r.url().includes("acknowledgeAppraisal")) errors.push(`http ${r.status()}: ${r.url().slice(0, 140)}`); };
    page.on("console", onConsole); page.on("pageerror", onPageErr); page.on("response", onResp);
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1200);
      const bodyText = (await page.textContent("body"))?.slice(0, 4000) ?? "";
      if (route !== "/login" && route !== "/careers" && bodyText.includes("Sign in with Kimi") && !route.startsWith("/portal"))
        errors.push("auth wall: login shown on protected route");
      if (bodyText.trim().length < 30) errors.push("near-empty page");
    } catch (e) {
      errors.push("nav: " + String(e).slice(0, 160));
    }
    page.off("console", onConsole); page.off("pageerror", onPageErr); page.off("response", onResp);
    if (errors.length) { problems++; console.log(`FAIL ${route}`); errors.forEach((e) => console.log("   " + e)); }
    else console.log(`OK   ${route}`);
  }
  console.log(`\n===== ${routes.length - problems}/${routes.length} routes clean =====`);
  await browser.close();
  process.exit(problems ? 1 : 0);
})();
