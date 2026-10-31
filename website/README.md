# Unique Care UK — public website (uniquecareuk.com)

The public marketing website for Unique Care UK: a faithful rebuild of
https://www.uniquecareuk.com. This is a **separate app and separate deployment**
from the Unique Care UK application (the staff/operations portal). Nothing in
the existing application is modified; the website only **reads** published jobs
from it and **links** to its public apply pages.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (design tokens as CSS variables in `app/globals.css`)
- React Hook Form + Zod (client and server validation)
- Supabase (Postgres) — `website_`-prefixed tables only, anon key with RLS
- Resend for email notifications + auto-replies (optional in preview)
- Cloudflare Turnstile spam protection (optional; honeypot + IP rate limiting always on)
- ISR (`revalidate = 300`) on careers/reviews + `/api/revalidate?secret=...`

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_ADMIN_PORTAL_URL` | Staff portal base URL — careers load live jobs from `{url}/api/public/jobs`; also footer **Admin portal** + Apply links |
| `JOBS_PORTAL_URL` | Optional override if the public jobs API host differs from the portal UI |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Website's own `website_` tables (same project is fine) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only, for review moderation links. Never shipped to the browser. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TO` | Email notifications + auto-replies |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile |
| `REVALIDATE_SECRET` | On-demand ISR: `GET /api/revalidate?secret=...` |
| `REVIEW_MODERATION_SECRET` | Signs the approve/reject links in review emails |

## Database

Apply `supabase/migrations/0001_website_tables.sql` to the Supabase project.
It creates **only** `website_enquiries` and `website_reviews` (RLS on: anonymous
INSERT only; approved reviews readable), seeds the launch testimonial, and
documents the retention cron job.

## Deployment (Vercel)

1. Import this folder as its own Vercel project (root directory = this folder).
2. Set the environment variables above.
3. Point `uniquecareuk.com` (non-www canonical) at this project; keep the
   existing application on its own URL or a subdomain such as
   `portal.uniquecareuk.com` (DNS only — no app changes).

A `Dockerfile` is included for container deployments (Next.js standalone output).

## How the integration works

- **Jobs** are published inside the existing application
  (`job_postings.status = 'live'`). The website reads them server-side with the
  anon key every 5 minutes (ISR) and lists them on `/careers` and
  `/careers/jobs`. If the source is unreachable or empty, the fallback role
  pages from the original brief are shown instead.
- **Applying**: each live job's **Apply** button links to the existing
  application's own public apply page (`<app-url>/apply/<apply_slug>`), so
  applications land exactly where the team already manages them.
- **Enquiries & reviews** are stored in the new `website_` tables; every
  submission emails `info@uniquecareuk.com` (reviews include signed,
  expiring approve/reject links so staff can moderate without a login).
- The website has **no** login, sign-up, dashboard or admin pages.
