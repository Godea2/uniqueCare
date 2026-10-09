/* Playwright E2E: demo login page — credentials form + one-click persona sign-in. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; failures.push(name + (extra ? ` :: ${extra}` : "")); console.log(`FAIL ${name} ${extra}`); }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const nav = page.locator('nav[aria-label="Main"]');
  // isVisible() does not wait — always poll with waitFor instead
  const visible = async (loc, ms = 12000) => {
    try { await loc.first().waitFor({ state: "visible", timeout: ms }); return true; } catch { return false; }
  };
  const absent = async (loc) => (await loc.count()) === 0;

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  check("login page shows Kimi sign-in", await visible(page.getByRole("button", { name: "Sign in with Kimi" })));
  check("demo panel visible with shared password", await visible(page.getByText("UniqueCare2026!")));
  check("all 8 persona cards listed", (await page.getByRole("button", { name: "Sign in", exact: true }).count()) === 8);

  // 1. credentials form — sign in as the CRM agent
  await page.locator("#demo-email").fill("tanya@uniquecareuk.co.uk");
  await page.locator("#demo-password").fill("UniqueCare2026!");
  await page.getByRole("button", { name: "Sign in with demo credentials" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  await nav.getByRole("link", { name: "Dashboard", exact: true }).waitFor({ state: "visible", timeout: 15000 });
  check("credential sign-in lands on dashboard", page.url() === `${BASE}/`);
  check("dashboard greets Tanya", await visible(page.getByText(/Good (morning|afternoon|evening), Tanya/), 3000));
  check("CRM nav visible for agent", await visible(nav.getByRole("link", { name: "Tickets", exact: true }), 3000));
  check("agent cannot see admin-only Settings", await absent(nav.getByRole("link", { name: "Settings", exact: true })));

  // wrong password shows an error, not a crash
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#demo-email").fill("tanya@uniquecareuk.co.uk");
  await page.locator("#demo-password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in with demo credentials" }).click();
  check("wrong password shows friendly error", await visible(page.getByRole("alert"), 8000));
  check("wrong password stays on login page", page.url().includes("/login"));

  // 2. one-click persona — Care Worker sees only their world
  const card = page.locator("div.rounded-xl", { hasText: "carer@uniquecareuk.co.uk" }).first();
  await card.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  await nav.getByRole("link", { name: "Dashboard", exact: true }).waitFor({ state: "visible", timeout: 15000 });
  check("one-click persona sign-in lands on dashboard", page.url() === `${BASE}/`);
  check("care worker sees My Rota", await visible(nav.getByRole("link", { name: "My Rota", exact: true }), 3000));
  check("care worker cannot see CQC readiness", await absent(nav.getByRole("link", { name: "Readiness dashboard", exact: true })));
  check("care worker cannot see recruitment Pipeline", await absent(nav.getByRole("link", { name: "Pipeline", exact: true })));

  // 3. switch persona — Team Leader (interviews + team oversight, not office admin)
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const tl = page.locator("div.rounded-xl", { hasText: "ngozi@uniquecareuk.co.uk" }).first();
  await tl.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  await nav.getByRole("link", { name: "Dashboard", exact: true }).waitFor({ state: "visible", timeout: 15000 });
  check("team leader sign-in lands on dashboard", page.url() === `${BASE}/`);
  check("dashboard greets Ngozi", await visible(page.getByText(/Good (morning|afternoon|evening), Ngozi/), 3000));
  check("team leader sees Interviews", await visible(nav.getByRole("link", { name: "Interviews", exact: true }), 3000));
  check("team leader cannot see office-only Jobs admin", await absent(nav.getByRole("link", { name: "Jobs", exact: true })));

  await browser.close();
  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  if (failures.length) { console.log("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
})().catch((e) => { console.error("E2E crashed:", e.message); process.exit(1); });
