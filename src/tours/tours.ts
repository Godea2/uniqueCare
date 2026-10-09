import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

/* ── UniqueCare guided tours ──────────────────────────────────────────────
   Two kinds:
   · Full product tour — shell + every visible menu group (role-aware).
   · Page tour — anchored to data-tour attributes on the current page.
   Steps whose element is not on screen are skipped, so one definition
   works for every role.                                                        */

type StepDef = {
  element?: string;
  title: string;
  description: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
};

const GROUP_INFO: Record<string, { title: string; description: string }> = {
  overview: {
    title: "Dashboard",
    description: "Your morning briefing: visit coverage, compliance alerts, tickets and tasks — everything that needs attention today.",
  },
  recruitment: {
    title: "Recruitment",
    description: "Jobs, shareable apply links, the form builder, AI screening, pipeline, interviews, compliance checks and training — the full journey from advert to hire.",
  },
  staff: {
    title: "Staff",
    description: "Your workforce directory, the compliance matrix, supervision notes and appraisals — evidence CQC inspectors ask for.",
  },
  clients: {
    title: "Clients",
    description: "Service-user directory, care plans, support plans, reviews and change events — the clinical heart of the service.",
  },
  rota: {
    title: "Rota",
    description: "The week planner for scheduling visits, reassignments for gaps, and My Rota where carers see their own visits.",
  },
  "crm-helpdesk": {
    title: "CRM & Helpdesk",
    description: "Tickets, contacts, tasks and reports — every phone call, complaint and compliment tracked to resolution.",
  },
  cqc: {
    title: "CQC",
    description: "The readiness dashboard scores you against the five key questions, incidents are logged here, and the inspection pack exports your evidence.",
  },
  system: {
    title: "System",
    description: "Settings and the audit log — a tamper-evident record of who did what, when.",
  },
};

function toDriverSteps(defs: StepDef[]): DriveStep[] {
  return defs
    .filter((d) => !d.element || document.querySelector(d.element))
    .map((d) => ({
      element: d.element,
      popover: {
        title: d.title,
        description: d.description,
        side: d.side ?? "bottom",
        align: d.align ?? "start",
      },
    }));
}

function makeDriver(steps: DriveStep[]) {
  return driver({
    showProgress: true,
    popoverClass: "uc-tour",
    animate: true,
    smoothScroll: true,
    allowClose: true,
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 12,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    steps,
  });
}

/* ── Full product tour ── */
export function startFullTour() {
  const groupSteps: StepDef[] = Array.from(
    document.querySelectorAll<HTMLElement>("[data-tour-group]"),
  ).map((el) => {
    const key = el.getAttribute("data-tour-group") ?? "";
    const info = GROUP_INFO[key] ?? { title: el.textContent ?? key, description: "" };
    return {
      element: `[data-tour-group="${key}"]`,
      title: info.title,
      description: info.description,
      side: "right" as const,
      align: "start" as const,
    };
  });

  const defs: StepDef[] = [
    {
      title: "Welcome to UniqueCare Connect",
      description: "This quick tour shows you around the whole application — the menus, search, notifications and your account. It takes about a minute, and every page also has its own tour via Help → Tour this page.",
    },
    {
      element: "[data-tour='shell-home']",
      title: "Home",
      description: "The logo always brings you back to your dashboard, wherever you are.",
      side: "bottom",
    },
    {
      element: "[data-tour='shell-search']",
      title: "Global search",
      description: "Search clients, staff, contacts, tickets and candidates from anywhere. Press ⌘K (or Ctrl+K) to open it instantly.",
      side: "bottom",
    },
    {
      element: "[data-tour='shell-nav']",
      title: "Main menu",
      description: "Everything lives in these groups. You only see what your role needs — a carer sees a simpler menu than the registered manager. Groups collapse if you want a tidy sidebar.",
      side: "right",
    },
    ...groupSteps,
    {
      element: "[data-tour='shell-notifications']",
      title: "Notifications",
      description: "Alerts land here — new applications, expiring documents, ticket replies. The red badge counts unread items.",
      side: "bottom",
      align: "end",
    },
    {
      element: "[data-tour='shell-role']",
      title: "View app as role",
      description: "Managers can preview exactly what each role sees — handy for training and for checking permissions.",
      side: "bottom",
      align: "end",
    },
    {
      element: "[data-tour='shell-help']",
      title: "Help & tours",
      description: "Stuck on a page? Open Help and choose “Tour this page” for a guided walkthrough of whatever you're looking at.",
      side: "bottom",
      align: "end",
    },
    {
      element: "[data-tour='shell-account']",
      title: "Your account",
      description: "Your profile, My rota & profile, and sign out live here.",
      side: "bottom",
      align: "end",
    },
    {
      title: "You're all set",
      description: "That's the lay of the land. Open any menu and use Help → Tour this page whenever you want a deeper look. Enjoy!",
    },
  ];

  makeDriver(toDriverSteps(defs)).drive();
}

/* ── Per-page tours ── */
type PageTour = { match: RegExp; steps: StepDef[] };

const H = "[data-tour='page-header']";
const A = "[data-tour='page-actions']";

const PAGE_TOURS: PageTour[] = [
  {
    match: /^\/$/,
    steps: [
      { element: H, title: "Your dashboard", description: "A personal greeting plus the numbers that matter for your role. It's the first thing to check each morning." },
      { element: "[data-tour='stat-card']", title: "Live metrics", description: "Each tile is a live number — coverage, unfilled visits, new applicants, reviews due. Click any tile to jump straight to the work behind it." },
      { element: "[data-tour='quick-actions']", title: "Quick actions", description: "One-click jumps to the tasks your role does most often.", side: "right" },
      { element: "[data-tour='today-panel']", title: "Today at a glance", description: "Carers see today's visits here; office roles see tasks due soon.", side: "left" },
    ],
  },
  {
    match: /^\/recruitment\/jobs/,
    steps: [
      { element: H, title: "Jobs", description: "Every vacancy, from draft to live to closed. A job can only go live once it has screening requirements — that's what powers fair, consistent AI scoring." },
      { element: A, title: "Create & manage", description: "Create a new vacancy here. The AI can suggest weighted requirements from your job description — you stay in control of the final weights.", side: "left" },
      { element: "[data-tour='job-list']", title: "Vacancy cards", description: "Each card shows the pipeline counts and apply-link tools. Use the share menu to copy the public apply link, download a QR code, or create tracked links (e.g. “Facebook”) to see which channel brings candidates.", side: "top" },
    ],
  },
  {
    match: /^\/recruitment\/forms/,
    steps: [
      { element: H, title: "Application form builder", description: "Design the public application form candidates fill in. Start from a template or build your own — published versions are frozen so applications always match the form that was live." },
      { element: A, title: "Autosave & publish", description: "Changes autosave as a draft. Publish when ready — candidates immediately see the new version.", side: "left" },
      { element: "[data-tour='form-canvas']", title: "Form canvas", description: "Drag fields to reorder, click one to edit its label, help text, conditions and knockout rules. Core fields (name, email, mobile, CV, consent) are locked for compliance and always come first. Knockouts flag for human review — they never auto-reject.", side: "right" },
    ],
  },
  {
    match: /^\/recruitment\/pipeline/,
    steps: [
      { element: H, title: "Candidate pipeline", description: "Every applicant, organised by stage — from “applied” to “hired”. AI scores each application against the job's requirements with evidence quoted from the CV." },
      { element: "[data-tour='pipeline-board']", title: "The board", description: "Move candidates between stages as they progress. Scores of 85+ are auto-shortlisted and sent an interview invitation; 60–84 land in review; below 60 go to the screen-out queue for a human decision.", side: "top" },
      { element: A, title: "Filters & actions", description: "Filter by job, and open any card for the full AI breakdown, documents and notes.", side: "left" },
    ],
  },
  {
    match: /^\/recruitment\/interviews/,
    steps: [
      { element: H, title: "Interviews", description: "Book interviews, share candidate packs with the panel, and capture structured scores. Candidates pick their own slot from the booking link." },
      { element: A, title: "Schedule", description: "Book a new interview or send a self-scheduling link from here.", side: "left" },
    ],
  },
  {
    match: /^\/recruitment\/compliance/,
    steps: [
      { element: H, title: "Compliance checks", description: "Pre-employment evidence — DBS, right to work, references, training certificates. Verify documents here before anyone starts; the queue shows exactly what's outstanding." },
    ],
  },
  {
    match: /^\/recruitment\/training/,
    steps: [
      { element: H, title: "Training", description: "Induction and online training for new hires — book sessions, track progress and mark completion. Finished training feeds straight into the compliance matrix." },
    ],
  },
  {
    match: /^\/staff\/compliance/,
    steps: [
      { element: H, title: "Compliance matrix", description: "Every staff member against every required check. Green is in date, amber expires within 30 days, red is missing or expired — the exact view inspectors ask for." },
    ],
  },
  {
    match: /^\/staff\/supervision/,
    steps: [
      { element: H, title: "Supervision notes", description: "Record supervision sessions and spot checks. Notes are timestamped and attributed — your evidence trail for the Well-led and Responsive key questions." },
      { element: A, title: "New note", description: "Record a supervision in under a minute.", side: "left" },
    ],
  },
  {
    match: /^\/staff\/appraisals/,
    steps: [
      { element: H, title: "Appraisals", description: "Annual appraisals with objectives and outcomes. Overdue appraisals surface on the dashboard so nothing slips." },
    ],
  },
  {
    match: /^\/staff/,
    steps: [
      { element: H, title: "Staff directory", description: "Everyone who works here — carers, coordinators, office team. Open a profile for contact details, compliance status, supervision history and rota patterns." },
      { element: A, title: "Add staff", description: "New starters are added here; onboarding checklists keep their file complete.", side: "left" },
    ],
  },
  {
    match: /^\/clients\/care-plans/,
    steps: [
      { element: H, title: "Care plans", description: "Person-centred care plans with goals, risks and preferences. AI can draft a plan from assessment notes — a person always reviews and approves before it goes live." },
    ],
  },
  {
    match: /^\/clients\/support-plans/,
    steps: [
      { element: H, title: "Support plans", description: "Day-to-day support plans that sit alongside the care plan — routines, communication needs and what good support looks like for each person." },
    ],
  },
  {
    match: /^\/clients\/reviews/,
    steps: [
      { element: H, title: "Reviews", description: "Scheduled plan reviews. Anything due or overdue also appears on your dashboard, and completed reviews are filed against the client record." },
    ],
  },
  {
    match: /^\/clients\/change-events/,
    steps: [
      { element: H, title: "Change events", description: "Significant changes — hospital admissions, medication changes, safeguarding concerns. Logging them here keeps the care plan and the rota in step with reality." },
    ],
  },
  {
    match: /^\/clients/,
    steps: [
      { element: H, title: "Client directory", description: "Everyone you support. Open a record for care plans, visit history, contacts and documents in one place." },
      { element: A, title: "Add a client", description: "Start here when a new care package begins — the record flows through to rota, plans and invoicing data.", side: "left" },
    ],
  },
  {
    match: /^\/rota\/reassignments/,
    steps: [
      { element: H, title: "Reassignments", description: "When a carer calls in sick or a visit needs cover, reassign it here. Affected staff are notified and their rotas update instantly." },
    ],
  },
  {
    match: /^\/rota/,
    steps: [
      { element: H, title: "Week planner", description: "The scheduling heart of the service: every visit, every carer, one week at a time. Unassigned visits are flagged red so gaps never hide." },
      { element: A, title: "Plan the week", description: "Generate a week from recurring patterns, add visits, and publish when ready — carers see their rota the moment you do.", side: "left" },
      { element: "[data-tour='rota-grid']", title: "The grid", description: "Click a cell to add or edit a visit. Coverage and unfilled counts update as you work.", side: "top" },
    ],
  },
  {
    match: /^\/me/,
    steps: [
      { element: H, title: "My rota & profile", description: "Your visits, your hours, your details. This is the page carers use most — check it each morning for today's schedule." },
    ],
  },
  {
    match: /^\/crm\/tickets/,
    steps: [
      { element: H, title: "Tickets", description: "Every enquiry, complaint, compliment and safeguarding concern — tracked from first call to resolution with a full audit trail." },
      { element: A, title: "Log a ticket", description: "New ticket in seconds: pick the category, set the priority, assign it. SLAs start ticking immediately.", side: "left" },
      { element: "[data-tour='ticket-list']", title: "The queue", description: "Filter by status or priority. Overdue and safeguarding tickets are highlighted so nothing urgent is missed.", side: "top" },
    ],
  },
  {
    match: /^\/crm\/contacts/,
    steps: [
      { element: H, title: "Contacts", description: "Families, GPs, social workers, commissioners — everyone you deal with, linked to the clients and tickets they relate to." },
    ],
  },
  {
    match: /^\/crm\/tasks/,
    steps: [
      { element: H, title: "Tasks", description: "Your personal to-do list plus anything assigned to you. Due-today and overdue items surface on the dashboard too." },
      { element: A, title: "New task", description: "Capture follow-ups the moment you promise them.", side: "left" },
    ],
  },
  {
    match: /^\/crm\/reports/,
    steps: [
      { element: H, title: "Reports", description: "Response times, complaint trends, category breakdowns — the numbers for your monthly review and CQC evidence." },
    ],
  },
  {
    match: /^\/cqc\/incidents/,
    steps: [
      { element: H, title: "Incidents", description: "Log incidents, near misses and safeguarding events with severity and follow-up actions. Patterns here feed the readiness dashboard." },
    ],
  },
  {
    match: /^\/cqc\/inspection-pack/,
    steps: [
      { element: H, title: "Inspection pack", description: "One click assembles your evidence — policies, audits, training records, feedback — ready for an inspection or a PIR return." },
    ],
  },
  {
    match: /^\/cqc/,
    steps: [
      { element: H, title: "CQC readiness dashboard", description: "Your service scored against the five key questions — Safe, Effective, Caring, Responsive, Well-led — from live data, not a spreadsheet." },
      { element: "[data-tour='cqc-domains']", title: "The five key questions", description: "Each card shows where you're strong and where evidence is thin. Click through to fix the underlying records.", side: "top" },
    ],
  },
  {
    match: /^\/settings/,
    steps: [
      { element: H, title: "Settings", description: "Service configuration — locations, visit types, notification preferences and integrations. Registered Manager access only." },
    ],
  },
  {
    match: /^\/audit/,
    steps: [
      { element: H, title: "Audit log", description: "A tamper-evident record of every significant action — who, what, when. Invaluable for inspections and investigations." },
    ],
  },
];

export function startPageTour(pathname: string) {
  const tour = PAGE_TOURS.find((t) => t.match.test(pathname));
  const shellSteps: StepDef[] = [
    {
      element: "[data-tour='shell-help']",
      title: "Tours are everywhere",
      description: "This button is on every page — “Tour this page” explains what you're looking at, “Full product tour” shows the whole app.",
      side: "bottom",
      align: "end",
    },
  ];
  const defs = tour ? [...tour.steps, ...shellSteps] : shellSteps;
  makeDriver(toDriverSteps(defs)).drive();
}

/* First-visit welcome state (UI preference only, kept in the browser) */
const SEEN_KEY = "uc-tour-welcome-v1";
export const welcomeSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
};
export const markWelcomeSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode — fine */
  }
};
