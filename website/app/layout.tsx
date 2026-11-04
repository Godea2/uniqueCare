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
import PublicChrome from "@/components/PublicChrome";
import JsonLd from "@/components/JsonLd";
import { organizationJsonLd } from "@/lib/jsonld";
import { getAreas } from "@/lib/areas-source";
import { getServices } from "@/lib/services-source";
import { getSiteSettings } from "@/lib/site-source";

export const metadata: Metadata = {
  metadataBase: new URL(staticSite.url),
  title: { default: "Unique Care UK | Home Care in London & Hertfordshire", template: "%s" },
  description:
    "Professional domiciliary, live-in care, and supported living across London and Hertfordshire. Compassionate, personalised home care.",
  keywords: [
    "home care",
    "domiciliary care",
    "live-in care",
    "supported living",
    "London",
    "Hertfordshire",
    "Hackney",
    "dementia care",
    "palliative care",
    "care agency",
  ],
  verification: { google: "UVHI4zdCsKmUPoMooXWalizNp0Y9tMlyjqFWxY7bCbA" },
  openGraph: {
    locale: "en_GB",
    siteName: "Unique Care UK",
    type: "website",
    images: [{ url: "/images/og-image.png", width: 1200, height: 630, alt: "Unique Care UK" }],
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [site, services, areas] = await Promise.all([getSiteSettings(), getServices(), getAreas()]);
  return (
    <html lang="en-GB" className={`${heading.variable} ${body.variable}`}>
      <body>
        <JsonLd data={organizationJsonLd()} />
        <PublicChrome
          header={
            <Header
              services={services}
              areas={areas}
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
          cta={<CtaBand />}
          floating={
            <>
              <WhatsAppButton />
              <MobileCtaBar />
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
