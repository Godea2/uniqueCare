import type { LegalSection } from "./privacy";

export const modernSlaveryInfo = {
  financialYear: "1 August 2025 to 31 July 2026",
  dateReviewed: "May 2026",
  nextReview: "July 2026",
  responsiblePerson: "Ruby Atiq",
};

export const modernSlaverySections: LegalSection[] = [
  {
    id: "policy-statement",
    title: "1. Policy Statement",
    blocks: [
      { type: "p", text: "Modern slavery is a crime that results in an abhorrent abuse of human rights. The Modern Slavery Act 2015 created offences of slavery, servitude, forced or compulsory labour, and human trafficking." },
      { type: "p", text: "Unique Care UK has a zero-tolerance approach to modern slavery. We are committed to acting ethically and with integrity in all our business dealings and relationships, and to implementing and enforcing effective systems to ensure slavery and human trafficking is not taking place anywhere in our organisation or supply chains." },
    ],
  },
  {
    id: "our-organisation",
    title: "2. Our Organisation",
    blocks: [
      { type: "p", text: "Unique Care UK is an adult social care provider operating in the UK. We provide care and support to vulnerable adults in their own homes and in supported living settings. We directly employ staff and work with regulated agencies and UK suppliers." },
    ],
  },
  {
    id: "definitions",
    title: "3. Definitions",
    blocks: [
      { type: "p", text: "For the purpose of this policy:" },
      {
        type: "list",
        items: [
          "Slavery: the status or condition of a person over whom powers of ownership are exercised.",
          "Servitude: an obligation to provide services imposed by coercion, with no possibility of changing that condition.",
          "Forced or compulsory labour: work exacted under threat of penalty and not offered voluntarily.",
          "Human trafficking: arranging or facilitating the travel of a person with a view to exploitation.",
          "Child labour: as defined by the ILO. Note: this policy relates to adult services only.",
        ],
      },
    ],
  },
  {
    id: "compliance-requirements",
    title: "4. Compliance Requirements",
    blocks: [
      { type: "p", text: "The Modern Slavery Act 2015 requires organisations with a turnover of £36 million or more to publish an annual statement. Although Unique Care UK is below this threshold, we voluntarily produce this statement as best practice and to meet commissioner requirements. We are committed to transparency in our recruitment and supply chains." },
    ],
  },
  {
    id: "due-diligence-and-risk-management",
    title: "5. Due Diligence & Risk Management",
    blocks: [
      { type: "p", text: "To prevent modern slavery we:" },
      {
        type: "list",
        items: [
          "Carry out right to work and DBS checks for all staff",
          "Use only CQC registered agencies and reputable UK suppliers",
          "Include modern slavery clauses in supplier and contractor agreements",
          "Assess and monitor our supply chains for risk",
        ],
      },
    ],
  },
  {
    id: "reporting",
    title: "6. Reporting",
    blocks: [
      { type: "p", text: "Staff who believe there may be a case of modern slavery must report it to their manager in the first instance. Concerns can also be reported directly to: Modern Slavery Helpline: 08000 121 700 · Online: modernslaveryhelpline.org" },
      { type: "p", text: "Unique Care UK supports a culture of openness. Staff may also use our Whistleblowing Policy without fear of reprisal." },
    ],
  },
  {
    id: "training",
    title: "7. Training",
    blocks: [
      { type: "p", text: "All staff receive awareness of the Modern Slavery Act 2015 as part of induction. Managers receive additional training on their responsibilities to identify and report concerns. Training is refreshed through supervision, team meetings, e-learning and policy updates." },
    ],
  },
  {
    id: "related-policies",
    title: "8. Related Policies",
    blocks: [
      { type: "p", text: "This policy should be read alongside: Adult Safeguarding · Recruitment and Selection · Whistleblowing · Data Protection (GDPR) (see our Privacy Policy)." },
    ],
  },
  {
    id: "contact",
    title: "9. Contact",
    blocks: [
      { type: "p", text: "Email: info@uniquecareuk.com · Phone: 02039170260 · Business hours: Mon–Fri: 9am–5pm | Sat–Sun: 24-hour services" },
    ],
  },
];
