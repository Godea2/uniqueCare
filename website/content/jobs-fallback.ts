/**
 * Static content for the General Application page only.
 * Open roles on /careers and /careers/jobs come from the portal (live jobs).
 */
export type FallbackJob = {
  slug: string;
  title: string;
  location: string;
  type: string;
  statusLabel: string;
  summary: string;
  about: string[];
  duties?: string[];
  requirements?: string[];
  offer?: string[];
  listedInGrid: boolean;
};

const LOC = "London, Essex & Hertfordshire";
const OPEN = "Always open";

export const fallbackJobs: FallbackJob[] = [
  {
    slug: "domiciliary-care-assistant",
    title: "Domiciliary Care Assistant",
    location: LOC,
    type: "Full-time / Part-time",
    statusLabel: OPEN,
    listedInGrid: true,
    summary:
      "Provide personalised care and support to service users in their own homes. Assist with daily living activities, medication, and companionship.",
    about: [
      "At Unique Care UK, we believe that home is where the heart is. We're seeking dedicated domiciliary care assistants to provide personalised care and support to service users in their own homes.",
      "You'll help people maintain their independence and dignity while receiving the care they need. No two days are the same. You'll build genuine relationships with the people you care for.",
    ],
    duties: [
      "Assist with daily living activities such as personal care, eating, and mobility",
      "Administer medication as required and trained",
      "Provide emotional support and companionship",
      "Monitor and report changes in service user condition",
      "Maintain accurate care records",
      "Respect service users' dignity, privacy, and confidentiality",
    ],
    requirements: [
      "Compassionate, caring, and reliable personality",
      "Flexible with hours. Days, evenings, nights, weekends available",
      "Right to work in the UK",
      "Care experience preferred but not essential. Full training provided",
      "Driving licence preferred but not required",
    ],
    offer: [
      "Comprehensive induction course and ongoing training",
      "Competitive pay rates",
      "Flexible scheduling options",
      "Career progression opportunities",
      "24/7 on-call management support",
      "Mileage allowance for drivers",
    ],
  },
  {
    slug: "live-in-carer",
    title: "Live-in Carer",
    location: LOC,
    type: "Full-time",
    statusLabel: OPEN,
    listedInGrid: true,
    summary:
      "Live with and provide round-the-clock care for service users who need continuous support. Includes accommodation during placement.",
    about: [
      "Join our team as a live-in carer providing round-the-clock support to service users who need continuous care. You'll live with the service user during your placement, providing companionship, personal care, and peace of mind to them and their families.",
      "This is a deeply rewarding role for someone who enjoys building close, trusting relationships and making a real difference every day.",
    ],
    duties: [
      "Provide 24-hour care and companionship within the service user's home",
      "Assist with all personal care needs including washing, dressing, and toileting",
      "Prepare meals and manage household tasks",
      "Administer medication and monitor health conditions",
      "Accompany service users to appointments and social activities",
      "Maintain detailed daily care records",
    ],
    requirements: [
      "Minimum 6 months care experience (home care or residential)",
      "Comfortable living in a service user's home for extended periods",
      "Patient, empathetic, and adaptable",
      "Right to work in the UK",
      "DBS check (we can arrange this)",
    ],
    offer: [
      "Accommodation and meals provided during placement",
      "Premium pay rates",
      "Regular breaks and time off between placements",
      "Full training and specialist development",
      "24/7 management support",
      "Career progression to senior roles",
    ],
  },
  {
    slug: "senior-care-assistant",
    title: "Senior Care Assistant",
    location: LOC,
    type: "Full-time",
    statusLabel: OPEN,
    listedInGrid: true,
    summary:
      "Lead a team of carers, conduct care assessments, and ensure the highest standards of care delivery. Experience required.",
    about: [
      "We're looking for experienced care professionals to step into senior roles. As a Senior Care Assistant, you'll lead by example, mentor junior carers, and ensure every service user receives outstanding care.",
      "You'll conduct care assessments, update care plans, and act as a key link between our care team, service users, and their families.",
    ],
    duties: [
      "Lead and mentor a team of care assistants",
      "Conduct initial and ongoing care assessments",
      "Develop and review person-centred care plans",
      "Handle medication management and audits",
      "Liaise with healthcare professionals and families",
      "Ensure compliance with CQC standards and company policies",
    ],
    requirements: [
      "Minimum 2 years care experience in a domiciliary or residential setting",
      "NVQ Level 3 in Health & Social Care (or equivalent) preferred",
      "Strong leadership and communication skills",
      "Understanding of CQC regulations",
      "Valid driving licence and access to a vehicle",
    ],
    offer: [
      "Enhanced pay rate reflecting seniority",
      "Management training and career development",
      "Company phone and uniform provided",
      "Mileage allowance",
      "Pension scheme",
      "24/7 support from registered manager",
    ],
  },
  {
    slug: "care-coordinator",
    title: "Care Coordinator",
    location: LOC,
    type: "Full-time",
    statusLabel: OPEN,
    listedInGrid: true,
    summary:
      "Manage care schedules, match carers with service users, and coordinate day-to-day care operations from our office.",
    about: [
      "We're hiring a Care Coordinator to manage the day-to-day operations of our care delivery. You'll be the central point of contact for carers, service users, and families, ensuring the right carer is matched to the right client at the right time.",
      "This is an office-based role with occasional field visits, ideal for someone who is organised, people-focused, and passionate about care quality.",
    ],
    duties: [
      "Schedule and allocate care visits across the team",
      "Match carers with service users based on needs and compatibility",
      "Handle incoming enquiries and referrals",
      "Monitor care delivery quality and address concerns",
      "Maintain accurate records on our care management system",
      "Support recruitment and onboarding of new carers",
    ],
    requirements: [
      "Experience in care coordination, scheduling, or care management",
      "Excellent organisational and multitasking skills",
      "Strong communication, both written and verbal",
      "Proficiency with care management software",
      "Knowledge of CQC regulations preferred",
    ],
    offer: [
      "Office-based with regular hours",
      "Competitive salary",
      "Pension scheme",
      "Training and professional development",
      "Supportive team environment",
      "Career progression into management",
    ],
  },
  {
    slug: "supported-living-worker",
    title: "Supported Living Worker",
    location: LOC,
    type: "Full-time / Part-time",
    statusLabel: OPEN,
    listedInGrid: true,
    summary:
      "Support individuals with learning disabilities or mental health needs to live independently in their own homes or shared accommodation.",
    about: [
      "Support individuals with learning disabilities, autism, or mental health needs to live independently. You'll work in shared houses or individual flats, helping service users build life skills, access their community, and live the life they choose.",
      "This role is perfect for someone who believes in empowerment over dependency and wants to help people thrive.",
    ],
    duties: [
      "Support service users with daily routines and life skills",
      "Encourage independence and community participation",
      "Assist with personal care where needed",
      "Administer medication and maintain health records",
      "Plan and support social activities and outings",
      "Work as part of a team following individual support plans",
    ],
    requirements: [
      "Experience working with learning disabilities or mental health preferred",
      "Patient, positive, and person-centred approach",
      "Flexible. Shifts may include evenings, weekends, and sleep-ins",
      "Right to work in the UK",
      "Full training provided for the right candidate",
    ],
    offer: [
      "Full training including specialist courses",
      "Flexible shift patterns",
      "Competitive pay with enhanced rates for sleep-ins",
      "Career progression opportunities",
      "Supportive team and regular supervision",
      "Pension scheme",
    ],
  },
  {
    slug: "night-care-assistant",
    title: "Night Care Assistant",
    location: LOC,
    type: "Part-time / Nights",
    statusLabel: OPEN,
    listedInGrid: true,
    summary:
      "Provide overnight care and support, ensuring service users are safe, comfortable, and attended to throughout the night.",
    about: [
      "Provide essential overnight care and support to service users in their homes. You'll ensure they are safe, comfortable, and attended to throughout the night, whether that's helping with repositioning, medication, or simply being there if they need reassurance.",
      "This role suits people who prefer night shifts and want to make a quiet but vital difference.",
    ],
    duties: [
      "Provide personal care and support during the night",
      "Assist with repositioning and continence care",
      "Administer medication as prescribed",
      "Respond to emergencies and call bells",
      "Complete accurate night reports",
      "Maintain a safe and comfortable environment",
    ],
    requirements: [
      "Comfortable working through the night",
      "Previous care experience preferred but not essential",
      "Calm, reliable, and attentive",
      "Right to work in the UK",
      "Ability to travel to service users' homes",
    ],
    offer: [
      "Enhanced night rates",
      "Full training provided",
      "Consistent shift patterns available",
      "24/7 on-call support",
      "Mileage allowance",
      "Career progression opportunities",
    ],
  },
  {
    slug: "general-application",
    title: "General Application",
    location: LOC,
    type: "Various",
    statusLabel: OPEN,
    listedInGrid: false,
    summary:
      "Don't see a role that fits? Send us your CV and tell us about yourself.",
    about: [
      "Don't see a role that fits? We're always interested in hearing from compassionate, dedicated people who want to work in care.",
      "Send us your CV and tell us about yourself. We'll keep your details on file and contact you when a suitable position becomes available.",
    ],
    requirements: [
      "Passion for caring for others",
      "Right to work in the UK",
      "Willingness to complete full training",
    ],
    offer: [
      "Full training provided for all roles",
      "Flexible hours to suit your lifestyle",
      "Competitive pay rates",
      "Career progression opportunities",
      "24/7 management support",
      "Mileage allowance for drivers",
    ],
  },
];

export function getFallbackJob(slug: string): FallbackJob | undefined {
  return fallbackJobs.find((j) => j.slug === slug);
}
