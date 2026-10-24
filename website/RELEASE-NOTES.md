# Unique Care UK — Release Notes (24 October 2026)

Source: `Unique-Care-UK-Release-Notes.pdf` (copied into this folder and `app/update_24th_2026/`).

## Big picture

| Deliverable | Role |
|-------------|------|
| **Public website** (this project) | Rebuild of uniquecareuk.com — families, clients, applicants |
| **Management portal** | UniqueCare Connect — **unchanged** by website work |

Connection is one-way: website **reads** live job vacancies from the portal’s Supabase; it never writes portal data. Apply buttons link into the portal’s existing application forms.

## Website highlights

- **29 pages**: Home, About, Services (8), Areas (London / Essex / Herts), Careers + live jobs, Blog (3), Reviews, Contact, legal (Privacy, Terms, Modern Slavery, Carbon Reduction Plan)
- **Live jobs** from portal (`job_postings.status = 'live'`), ISR ~5 minutes; Apply → portal `/apply/<slug>`
- **Enquiries & reviews** in `website_*` tables only; email moderation (Approve/Reject, 7-day signed links)
- Spam: honeypot, rate limit, optional Cloudflare Turnstile
- SEO / JSON-LD / sitemap; WCAG 2.2 AA; strict security headers; no login on the website

## Migrations (apply on Supabase)

1. `supabase/migrations/0001_website_tables.sql`
2. `supabase/migrations/0002_website_moderation_rpc.sql`

Safe: only creates `website_` tables/policies — does not alter portal tables.

## Still needs client input

1. Portal public URL (e.g. `portal.uniquecareuk.com`) — until set, Apply may fall back to email  
2. Resend API key (enquiry / review / auto-reply email)  
3. Optional Turnstile keys  
4. Official brand assets if logo-sampled colours/fonts differ  
5. Copy confirmations (London/Essex/Herts wording)  
6. HR inbox (default careers@ / info@ per env)  
7. Analytics + cookie consent (later)

## Portal

Live portal at `hr-recruit/app` already includes through migration `0022`. The `update_24th_2026/portal-app` dump is a snapshot — **no portal port required** for this release.
