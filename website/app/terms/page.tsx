import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { termsSections } from "@/content/legal/terms";

export const metadata: Metadata = {
  title: "Terms of Service | Unique Care UK",
  description:
    "Terms of service for the Unique Care UK website. Read about our website usage terms, service disclaimers, intellectual property, and liability information.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      dateLine="Last updated: March 2026"
      sections={termsSections}
    />
  );
}
