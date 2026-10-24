import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { modernSlaveryInfo, modernSlaverySections } from "@/content/legal/modern-slavery";

export const metadata: Metadata = {
  title: "Modern Slavery & Human Trafficking Policy Statement | Unique Care UK",
  description:
    "Unique Care UK has a zero-tolerance approach to modern slavery. Read our policy statement on slavery, servitude, forced labour, and human trafficking under the Modern Slavery Act 2015.",
  alternates: { canonical: "/modern-slavery" },
};

export default function ModernSlaveryPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Modern Slavery & Human Trafficking Policy Statement"
      infoCard={[
        { label: "Financial year", value: modernSlaveryInfo.financialYear },
        { label: "Date reviewed", value: modernSlaveryInfo.dateReviewed },
        { label: "Next review", value: modernSlaveryInfo.nextReview },
        { label: "Responsible person", value: modernSlaveryInfo.responsiblePerson },
      ]}
      sections={modernSlaverySections}
    />
  );
}
