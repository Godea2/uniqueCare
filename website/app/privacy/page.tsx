import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { privacySections } from "@/content/legal/privacy";

export const metadata: Metadata = {
  title: "Privacy Policy | Unique Care UK",
  description:
    "Privacy policy for Unique Care UK. Learn how we collect, use, store, and protect your personal information in accordance with UK GDPR and the Data Protection Act 2018.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      dateLine="Last updated: March 2026"
      sections={privacySections}
    />
  );
}
