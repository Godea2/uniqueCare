import { db } from "../api/db";
import type { TableKey } from "./columns";

const tables: TableKey[] = [
  "organisations", "staffProfiles", "staffAvailability", "staffUnavailability", "clients",
  "clientPreferences", "clientRequiredSkills", "carePackages", "visitTemplates", "clientAssignedWorkers",
  "rotaWeeks", "visits", "visitAssignments", "reassignmentRequests", "travelCache", "jobPostings",
  "jobLinkSources", "applicationFormTemplates", "applicationForms", "applicationFormVersions",
  "candidates", "applications", "cvVersions", "emailOutbox", "rateLimitEvents", "preInterviewForms",
  "interviewSlots", "interviewBookings", "interviewScorecards", "complianceRequirements",
  "complianceDocuments", "references", "offerLetters", "trainingCourses", "trainingSessions",
  "trainingEnrolments", "dbsVerifications", "documentTemplates", "carePlans", "planReviews",
  "clientChangeEvents", "supervisorNotes", "appraisals", "incidents", "notifications",
  "automationRules", "auditLog", "aiRuns", "crmOrganisations", "crmContacts", "crmContactRelationships",
  "interactions", "tickets", "ticketWatchers", "ticketComments", "ticketEvents", "teams", "slaPolicies",
  "tasks", "mentions",
];

const main = async () => {
  for (const table of tables) {
    await db.from(table).neq("id", 0).delete();
  }
  console.log("cleared");
  process.exit(0);
};
main();
