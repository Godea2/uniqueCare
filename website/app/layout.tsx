import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted fonts (no external font downloads at build time).
const heading = localFont({
  src: [
    { path: "./fonts/fraunces-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/fraunces-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/fraunces-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-heading",
  display: "swap",
});
const body = localFont({
  src: [
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});
import { site } from "@/content/site";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CtaBand from "@/components/CtaBand";
import WhatsAppButton from "@/components/WhatsAppButton";
import FadeUpObserver from "@/components/FadeUpObserver";
import PublicChrome from "@/components/PublicChrome";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${heading.variable} ${body.variable}`}>
      <body>
        <PublicChrome
          header={<Header />}
          footer={<Footer />}
          cta={<CtaBand />}
          floating={<WhatsAppButton />}
        >
          {children}
        </PublicChrome>
        <FadeUpObserver />
      </body>
    </html>
  );
}
