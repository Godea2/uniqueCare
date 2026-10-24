export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "list"; items: string[] };

export type LegalSection = { id: string; title: string; blocks: LegalBlock[] };

export const privacySections: LegalSection[] = [
  {
    id: "introduction",
    title: "1. Introduction",
    blocks: [
      { type: "p", text: "Unique Care UK (a division of Unique Resourcing Ltd, VAT number 285 7129 71) is committed to protecting your privacy. This policy explains how we collect, use, store, and protect your personal information in accordance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018." },
      { type: "p", text: "For the purposes of data protection law, the data controller is Unique Resourcing Ltd. If you have any questions about this policy or how we handle your data, please contact us at info@uniquecareuk.com or call 02039170260." },
    ],
  },
  {
    id: "information-we-collect",
    title: "2. Information We Collect",
    blocks: [
      { type: "p", text: "We may collect the following types of personal information:" },
      { type: "h3", text: "Information you provide directly" },
      {
        type: "list",
        items: [
          "Contact enquiries: name, email address, phone number, enquiry type, care type, and your message when you use our contact form",
          "Job applications: name, email address, phone number, CV/resume, right-to-work status, and driving licence status when you apply for a position",
          "Care assessments: name, contact details, and information about care needs when you book an assessment",
        ],
      },
      { type: "h3", text: "Information collected automatically" },
      {
        type: "list",
        items: [
          "Technical data: IP address, browser type, device information, and pages visited",
          "Usage data: how you interact with our website, including pages viewed and time spent",
        ],
      },
    ],
  },
  {
    id: "how-we-use-your-information",
    title: "3. How We Use Your Information",
    blocks: [
      { type: "p", text: "We use your personal information for the following purposes:" },
      {
        type: "list",
        items: [
          "To respond to your care enquiries and arrange assessments",
          "To process job applications and contact you about vacancies",
          "To provide and manage care services",
          "To communicate with you about your care or employment",
          "To comply with legal and regulatory obligations (including CQC requirements)",
          "To improve our website and services",
        ],
      },
    ],
  },
  {
    id: "legal-basis-for-processing",
    title: "4. Legal Basis for Processing",
    blocks: [
      { type: "p", text: "We process your personal data on the following legal bases:" },
      {
        type: "list",
        items: [
          "Consent: when you submit a contact form or job application",
          "Contractual necessity: to provide care services you have requested",
          "Legal obligation: to comply with CQC regulations, employment law, and health and safety requirements",
          "Legitimate interests: to improve our services and respond to enquiries",
        ],
      },
    ],
  },
  {
    id: "how-we-share-your-information",
    title: "5. How We Share Your Information",
    blocks: [
      { type: "p", text: "We do not sell your personal information. We may share your data with:" },
      {
        type: "list",
        items: [
          "Care Quality Commission (CQC): as required by regulation",
          "Local authorities: when care is funded or referred by a council",
          "Healthcare professionals: to coordinate your care",
          "Service providers: who help us operate our website and business (e.g., email delivery, hosting), under strict data processing agreements",
          "Legal authorities: when required by law",
        ],
      },
    ],
  },
  {
    id: "data-retention",
    title: "6. Data Retention",
    blocks: [
      { type: "p", text: "We retain your personal information for as long as necessary to fulfil the purposes for which it was collected:" },
      {
        type: "list",
        items: [
          "Contact enquiries: 12 months after last contact",
          "Job applications: 6 months after the recruitment process ends (unsuccessful applicants) or the duration of employment plus 6 years (successful applicants)",
          "Care records: 8 years after the end of care, in line with CQC requirements",
        ],
      },
    ],
  },
  {
    id: "your-rights",
    title: "7. Your Rights",
    blocks: [
      { type: "p", text: "Under UK GDPR, you have the right to:" },
      {
        type: "list",
        items: [
          "Access: request a copy of the personal data we hold about you",
          "Rectification: request correction of inaccurate data",
          "Erasure: request deletion of your data (where legally permissible)",
          "Restriction: request that we limit how we use your data",
          "Portability: request your data in a portable format",
          "Objection: object to processing based on legitimate interests",
          "Withdraw consent: withdraw consent at any time where processing is based on consent",
        ],
      },
      { type: "p", text: "To exercise any of these rights, contact us at info@uniquecareuk.com. We will respond within one month." },
    ],
  },
  {
    id: "cookies",
    title: "8. Cookies",
    blocks: [
      { type: "p", text: "Our website uses essential cookies to ensure it functions correctly. We do not currently use analytics or advertising cookies. If this changes, we will update this policy and obtain your consent where required." },
    ],
  },
  {
    id: "data-security",
    title: "9. Data Security",
    blocks: [
      { type: "p", text: "We take appropriate technical and organisational measures to protect your personal data, including encryption in transit (HTTPS), secure hosting, access controls, and staff training. Our ISO 9001 and ISO 45001 certifications reflect our commitment to maintaining high standards of data handling and operational security." },
    ],
  },
  {
    id: "third-party-links",
    title: "10. Third-Party Links",
    blocks: [
      { type: "p", text: "Our website may contain links to external websites. We are not responsible for the privacy practices of those sites and recommend you read their privacy policies." },
    ],
  },
  {
    id: "childrens-privacy",
    title: "11. Children's Privacy",
    blocks: [
      { type: "p", text: "Our website is not directed at children under 16. We do not knowingly collect personal data from children. If you believe we have collected data from a child, please contact us immediately." },
    ],
  },
  {
    id: "changes-to-this-policy",
    title: "12. Changes to This Policy",
    blocks: [
      { type: "p", text: "We may update this policy from time to time. Any changes will be posted on this page with an updated revision date. We encourage you to review this page periodically." },
    ],
  },
  {
    id: "complaints",
    title: "13. Complaints",
    blocks: [
      {
        type: "p",
        text: "If you are unhappy with how we have handled your personal data, you have the right to lodge a complaint with the Information Commissioner's Office (ICO): Website: ico.org.uk · Telephone: 0303 123 1113",
      },
    ],
  },
  {
    id: "contact-us",
    title: "14. Contact Us",
    blocks: [
      {
        type: "p",
        text: "If you have any questions about this privacy policy or your personal data, please contact: Email: info@uniquecareuk.com · Phone: 02039170260 · Business hours: Mon–Fri: 9am–5pm | Sat–Sun: 24-hour services",
      },
    ],
  },
];
