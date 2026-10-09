# UniqueCare Connect

The operations platform for **Unique Care UK**, a CQC-registered domiciliary care
provider. One secure system covering four areas that share a single database, one
login and one design system:

| Module | What it does |
| ------ | ------------ |
| **Recruitment & onboarding (HR)** | Job postings, public careers site, AI application screening with evidence breakdowns, pipeline Kanban, pre-interview forms, interview slots and panel scorecards, compliance document checklist, references, offer letters with e-acceptance, training enrolment, DBS check-in, conversion to care worker |
| **Rota management** | Weekly planner generated from visit templates, constraint-based auto-assignment engine (`api/rota/engine.ts`), automatic reassignment when a worker reports unavailability, coverage KPIs, CSV export, mobile "My Rota" |
| **CQC compliance** | AI-drafted care plans and support plans (human approves — always), versioned documents, review triggers and change events, supervisor notes, appraisals, incident log, five-key-question readiness dashboard, inspection pack |
| **CRM & helpdesk** | Contacts with 360° timeline, organisations, call logging, tickets with SLA timers and escalation, @-mentions and notifications, tasks and follow-ups, reports |

## Tech stack

- **Frontend**: React 19 + TypeScript (strict) + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Hono + tRPC 11 (end-to-end typed), Supabase (Postgres)
- **Auth**: Supabase Auth. Sign-up sends a confirmation link; that link opens the
  create-password page. Later sign-ins use that email and password. The first account
  becomes the Registered Manager.
- **AI**: OpenAI-compatible gateway via the AI SDK (`api/ai/`), every call typed with
  zod and logged to `ai_runs`. AI assists — it never rejects a candidate, approves a
  plan or closes a safeguarding concern on its own.
- **Tests**: Vitest (`api/rota/engine.test.ts` — 11 tests over the assignment engine)

## Brand

White-and-blue clinical scheme. `--brand-600: #0586BF` is the exact blue extracted
from the company logo. Tokens live at the top of `src/index.css`; logo files are in
`public/` (`logo.png`, `logo-white.png` for the navy sidebar, `favicon.png`).

## Setup

```bash
npm install
# Apply supabase/migrations/0001_init.sql in the Supabase SQL editor first
npm run db:seed       # demo data: 25 clients, 37 staff, 15 candidates, 146 visits…
npm run dev           # http://localhost:3000
```

Environment variables are in `.env`:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the AI gateway
(`KIMI_AGENTGW_API_KEY`, `KIMI_AGENTGW_BASE_URL`).

In the Supabase dashboard, set **Authentication → URL configuration**:
Site URL `http://localhost:3000`, and add redirect URL `http://localhost:3000/auth/set-password`.
Email confirmation must stay enabled so sign-up sends the confirmation link.

## Production

```bash
npm run check   # type-check (frontend + server)
npm run test    # unit tests
npm run build   # vite build → dist/public + esbuild server bundle → dist/boot.js
npm start       # NODE_ENV=production node dist/boot.js (serves app + API on :3000)
```

## Seed data

`db/seed.ts` creates one organisation, 37 staff profiles across all eight roles,
25 clients across Birmingham postcodes, 2 live job postings, 15 candidates at
different pipeline stages, a published rota week with 146 visits, 12 tickets
(including a safeguarding escalation), care plans, incidents, document templates,
training courses and 18 automation rules. It is idempotent — safe to re-run.

## Notes for go-live

- Public surfaces: `/careers` (job board), `/careers/apply/:slug` (application form),
  `/portal/:token` (candidate portal — tokenised, no password).
- The audit log (`/audit`) records every sensitive action with actor and timestamp.
- Safeguarding tickets are visible to management roles only, and alert the
  Registered Manager immediately.
