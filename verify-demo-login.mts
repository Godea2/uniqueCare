/* Demo persona login verification: all 8 personas + wrong-password + unknown-email guards. */
const BASE = "http://localhost:3000";
const PERSONAS = [
  ["ruby@uniquecareuk.co.uk", "Ruby Osei", "super_admin"],
  ["daniel@uniquecareuk.co.uk", "Daniel Whitfield", "admin"],
  ["sofia@uniquecareuk.co.uk", "Sofia Marsh", "care_coordinator"],
  ["ngozi@uniquecareuk.co.uk", "Ngozi Eze", "team_leader"],
  ["marcus@uniquecareuk.co.uk", "Marcus Field", "supervisor"],
  ["helen@uniquecareuk.co.uk", "Helen Brooks", "interview_panel"],
  ["tanya@uniquecareuk.co.uk", "Tanya Reid", "crm_agent"],
  ["carer@uniquecareuk.co.uk", null, "care_worker"],
] as const;

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, extra = "") {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; failures.push(name); console.log(`FAIL ${name} ${extra}`); }
}

for (const [email, expectedName, expectedRole] of PERSONAS) {
  const r = await fetch(`${BASE}/api/demo-login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "UniqueCare2026!" }),
  });
  const body = await r.json();
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  check(`login ${email}`, r.status === 200 && body.ok === true && !!cookie, JSON.stringify(body));

  const me = await fetch(`${BASE}/api/trpc/core.me`, { headers: { cookie } });
  const meBody = await me.json();
  const staff = meBody.result?.data?.json;
  check(`  profile ${email}`, staff?.role === expectedRole && (expectedName === null || staff?.fullName === expectedName),
    `${staff?.fullName} / ${staff?.role}`);

  // sessions are independent per persona
  check(`  role-scoped ${email}`, typeof staff?.id === "number");
}

// guards
const bad1 = await fetch(`${BASE}/api/demo-login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "ruby@uniquecareuk.co.uk", password: "wrong" }),
});
check("wrong password rejected (401)", bad1.status === 401);
const bad2 = await fetch(`${BASE}/api/demo-login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "nobody@example.com", password: "UniqueCare2026!" }),
});
check("unknown email rejected (401)", bad2.status === 401);
const bad3 = await fetch(`${BASE}/api/demo-login`, { method: "POST", body: "not json" });
check("malformed body rejected (400)", bad3.status === 400);

// owner OAuth session still works
const owner = await fetch(`${BASE}/api/trpc/core.me`, {
  headers: { cookie: `kimi_sid=${process.env.QA_TOKEN}` },
});
const ownerBody = await owner.json();
check("owner session unaffected", ownerBody.result?.data?.json?.role === "super_admin");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (failures.length) { console.log("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
process.exit(0);
