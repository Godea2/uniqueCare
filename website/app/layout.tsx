import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted fonts (no external font downloads at build time).
// HCA-style pairing: Montserrat for BOTH headings and body.
const heading = localFont({
  src: [
    { path: "./fonts/montserrat-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/montserrat-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/montserrat-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-heading",
  display: "swap",
});
const body = localFont({
  src: [
    { path: "./fonts/montserrat-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/montserrat-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/montserrat-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/montserrat-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});
import { site as staticSite } from "@/content/site";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CtaBand from "@/components/CtaBand";
import WhatsAppButton from "@/components/WhatsAppButton";
import FadeUpObserver from "@/components/FadeUpObserver";
import MobileCtaBar from "@/components/MobileCtaBar";
import ChatbotWidget from "@/components/ChatbotWidget";
import PublicChrome from "@/components/PublicChrome";
import JsonLd from "@/components/JsonLd";
import { organizationJsonLd } from "@/lib/jsonld";
import { getAreas } from "@/lib/areas-source";
import { getServices } from "@/lib/services-source";
import { getSiteSettings } from "@/lib/site-source";
import { getNavItems } from "@/lib/nav-source";
import { themeToCssVars } from "@/lib/theme-defaults";

/** Site-wide metadata from CMS (SEO defaults + brand assets); falls back to the original static values. */
export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteSettings();
  const { seo, brand } = site;
  let metadataBase: URL;
  try {
    metadataBase = new URL(site.url || staticSite.url);
  } catch {
    metadataBase = new URL(staticSite.url);
  }
  return {
    metadataBase,
    title: { default: seo.defaultTitle, template: seo.titleTemplate },
    description: seo.defaultDescription,
    keywords: seo.keywords,
    verification: { google: "UVHI4zdCsKmUPoMooXWalizNp0Y9tMlyjqFWxY7bCbA" },
    openGraph: {
      locale: "en_GB",
      siteName: site.name,
      type: "website",
      images: [{ url: brand.ogImageUrl, width: 1200, height: 630, alt: site.name }],
    },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: "/" },
    icons: { icon: brand.faviconUrl, apple: brand.appleTouchIconUrl },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [site, services, areas, headerNav, mobileNav] = await Promise.all([
    getSiteSettings(),
    getServices(),
    getAreas(),
    getNavItems("header"),
    getNavItems("mobile_cta"),
  ]);
  return (
    <html
      lang="en-GB"
      className={`${heading.variable} ${body.variable}`}
      style={themeToCssVars(site.theme) as React.CSSProperties}
    >
      <body>
        <JsonLd data={organizationJsonLd(site)} />
        <PublicChrome
          header={
            <Header
              services={services}
              areas={areas}
              nav={headerNav}
              logoUrl={site.brand.logoUrl}
              site={{
                phonePrimary: site.phonePrimary,
                phonePrimaryTel: site.phonePrimaryTel,
                phonePrimaryDisplay: site.phonePrimaryDisplay,
                phoneMobile: site.phoneMobile,
                phoneMobileTel: site.phoneMobileTel,
                email: site.email,
              }}
            />
          }
          footer={<Footer />}
          cta={<CtaBand cta={site.ctaBand} phoneTel={site.phonePrimaryTel} />}
          floating={
            <>
              <ChatbotWidget />
              <WhatsAppButton href={site.whatsapp} enabled={site.whatsappEnabled} />
              <MobileCtaBar items={mobileNav} phoneTel={site.phonePrimaryTel} />
            </>
          }
        >
          {children}
        </PublicChrome>
        <FadeUpObserver />
      </body>
    </html>
  );
}
