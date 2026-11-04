# Website CMS

Registered Managers manage public website content in the **staff portal → Website**.

## What you can manage

| Portal page | Controls |
|-------------|----------|
| **Settings** | Company name, phones, email, offices, social, CQC, footer blurb |
| **Services** | Add / edit / archive care services (slug, copy, images, SEO) |
| **Areas** | Add / edit / archive areas we serve |
| **Page sections** | Home / About / Careers marketing blocks (hero, why-us, benefits…) |
| **Blog posts** | Articles (already live) |
| Inbox tools | Enquiries, reviews, applications, subscribers, newsletters |

Static TypeScript under `content/` remains the **offline fallback** if Supabase is empty or unreachable.

## Apply database migration

Run against the shared Supabase project (SQL editor or CLI):

1. `supabase/migrations/0004_website_cms.sql`
2. `supabase/migrations/0004b_website_services_seed.sql`

Then publish/edit in the portal. The public site revalidates via `/api/revalidate` (portal bumps this automatically on save).

## Env

Portal: `WEBSITE_URL`, `WEBSITE_REVALIDATE_SECRET`  
Website: `REVALIDATE_SECRET` (same value), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ADMIN_PORTAL_URL`
