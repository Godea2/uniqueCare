# Website CMS

Registered Managers manage public website content in the **staff portal → Website**.

## What you can manage

| Portal page | Controls |
|-------------|----------|
| **Brand & theme** | Colours, logos, favicon, OG image, SEO defaults, sitewide CTA band, WhatsApp |
| **Media** | Upload / link images & videos; pick them anywhere content needs a picture |
| **Branches** | Add / edit / remove office branches (address, phone, hours, map, photo) |
| **Navigation** | Header, footer, and mobile CTA links — add, reorder, hide |
| **Certifications** | ISO / badge grid on the homepage |
| **Settings** | Company name, phones, email, social, CQC, footer blurb |
| **Services** | Add / edit / archive care services (slug, copy, images, SEO) |
| **Areas** | Add / edit / archive areas we serve (with card images) |
| **Page sections** | Typed editors for every marketing block on Home, About, Careers, Contact, Services, Areas, Reviews, Blog |
| **Blog posts** | Articles |
| Inbox tools | Enquiries, reviews, applications, subscribers, newsletters |

Static TypeScript under `content/` remains the **offline fallback** if Supabase is empty or unreachable.

## Full CMS surfaces (migration 0005)

| Surface | Table / key | Public source | Consumed by |
|---------|-------------|---------------|-------------|
| Theme colours | `website_site_settings.payload.theme` | `lib/theme-source.ts` → CSS vars on `<html>` | every page (Tailwind brand tokens) |
| Brand assets | `payload.brand` (logo, favicon, OG, apple icon) | `getBrand()` | Header, Footer, `<head>` metadata |
| SEO defaults | `payload.seo` | `getSeoDefaults()` | root `generateMetadata` |
| CTA band | `payload.ctaBand` | `getCtaBand()` | `CtaBand` (site-wide band above footer) |
| WhatsApp | `payload.whatsapp`, `payload.whatsappEnabled` | `getSiteSettings()` | `WhatsAppButton` (hidden when `false`) |
| Branches | `website_branches` (published) | `lib/branches-source.ts` (falls back to `offices`) | Contact page, Footer |
| Navigation | `website_nav_items` (`header`, `footer_company`, `footer_legal`, `mobile_cta`) | `lib/nav-source.ts` | Header, Footer, MobileCtaBar |
| Certifications | `website_certifications` (published) | `lib/certifications-source.ts` | `CertificationGrid` (home) |
| Media library | `website_media_assets` | portal only (URLs are pasted into other fields) | — |
| Areas | `website_areas.image` / `image_alt` | `lib/areas-source.ts` | Areas index cards |
| Page sections | `website_page_sections` | `lib/sections-source.ts` (`getSection`, `getSectionMap`, `getPageSections`) | home (hero, stats, why_us, why_side, services_intro, certs_intro, testimonials_intro, areas_intro, closing_cta), about (hero, who_we_are, who_we_support, drivers, cta), careers (hero, benefits), contact (hero, form_intro), services/areas (hero) |

Every source falls back per-field/per-menu to the hardcoded defaults when a row is missing, so partial CMS data never blanks the site. Notes:

- Home stats figures like `"9+ years"` are replaced with the live years-of-care number.
- Remote (`https://…`) CMS images are rendered unoptimised (no `next/image` remote host config needed). Videos must be same-origin (CSP `media-src 'self'`).
- Jobs stay on the portal jobs source (`lib/jobs-source.ts`), not the CMS.
- `/api/revalidate` busts tags `website-cms`, `website-site`, `website-services`, `website-areas`, `website-branches`, `website-nav`, `website-certs`, `website-media` and `website-sections-<page>`.

## Apply database migration

Run against the shared Supabase project (SQL editor or CLI):

1. `supabase/migrations/0004_website_cms.sql`
2. `supabase/migrations/0004b_website_services_seed.sql`
3. `supabase/migrations/0005_website_cms_full.sql` — branches, nav, certifications, media library, area images, theme/brand/SEO/CTA-band settings and richer page-section seeds (idempotent)

Then publish/edit in the portal. The public site revalidates via `/api/revalidate` (portal bumps this automatically on save).

## Env

Portal: `WEBSITE_URL`, `WEBSITE_REVALIDATE_SECRET`  
Website: `REVALIDATE_SECRET` (same value), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ADMIN_PORTAL_URL`
