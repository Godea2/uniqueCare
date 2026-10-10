/** Domain types for the Supabase (Postgres) schema. Field names stay camelCase for the app. */

export const STAFF_ROLES = [
  "super_admin",
  "admin",
  "care_coordinator",
  "team_leader",
  "supervisor",
  "interview_panel",
  "care_worker",
  "crm_agent",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const APPLICATION_STAGES = [
  "applied",
  "screened_out",
  "shortlisted",
  "review",
  "pre_interview_forms_sent",
  "pre_interview_forms_complete",
  "interview_booked",
  "interviewed",
  "approved",
  "rejected",
  "compliance_docs_requested",
  "compliance_docs_complete",
  "offer_sent",
  "offer_accepted",
  "training_booked",
  "online_training_in_progress",
  "dbs_verified",
  "training_complete",
  "hired",
  "withdrawn",
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export interface AiRuns {
  id: number;
  feature: string;
  model: string | null;
  promptVersion: string | null;
  latencyMs: number | null;
  tokens: number | null;
  status: string;
  error: string | null;
  createdAt: string;
}

export interface ApplicationForms {
  id: number;
  jobPostingId: number;
  templateId: number | null;
  name: string;
  draftSchema: unknown | null;
  publishedVersionId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationFormTemplates {
  id: number;
  name: string;
  status: string;
  schemaJson: unknown | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationFormVersions {
  id: number;
  formId: number;
  version: number;
  schemaJson: unknown;
  publishedBy: string | null;
  createdAt: string;
}

export interface Applications {
  id: number;
  jobPostingId: number;
  candidateId: number;
  cvText: string | null;
  cvFileName: string | null;
  answers: unknown | null;
  aiScore: number | null;
  aiBreakdown: unknown | null;
  aiSummary: string | null;
  aiFlags: unknown | null;
  stage: string;
  stageHistory: unknown | null;
  rejectionReason: string | null;
  adminOverride: boolean | null;
  overrideReason: string | null;
  portalToken: string;
  createdAt: string;
  updatedAt: string;
  cvFileKey: string | null;
  sourceChannel: string | null;
  formVersionId: number | null;
  cvUnreadable: boolean | null;
}

export interface Appraisals {
  id: number;
  staffId: number;
  periodStart: string;
  periodEnd: string;
  appraiserId: number | null;
  appraiserName: string | null;
  aiDraft: unknown | null;
  final: unknown | null;
  status: string;
  signedByStaffAt: string | null;
  nextAppraisalDue: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: unknown | null;
  at: string;
}

export interface AutomationRules {
  id: number;
  key: string;
  label: string;
  description: string | null;
  enabled: boolean | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

export interface Candidates {
  id: number;
  userId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  postcode: string | null;
  rightToWorkStatus: string | null;
  hasDrivingLicence: boolean | null;
  hasVehicle: boolean | null;
  sourceChannel: string | null;
  createdAt: string;
}

export interface CarePackages {
  id: number;
  clientId: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  commissionedHoursPerWeek: string;
  notes: string | null;
}

export interface CarePlans {
  id: number;
  clientId: number;
  templateId: number | null;
  planType: string;
  version: number;
  status: string;
  inputs: unknown | null;
  content: unknown | null;
  aiModel: string | null;
  aiGeneratedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  nextReviewDue: string | null;
  changeReason: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientAssignedWorkers {
  id: number;
  clientId: number;
  staffId: number;
  isPrimary: boolean | null;
}

export interface ClientChangeEvents {
  id: number;
  clientId: number;
  type: string;
  description: string;
  reportedBy: string | null;
  occurredAt: string;
  triggersReview: boolean | null;
  createdAt: string;
}

export interface ClientPreferences {
  id: number;
  clientId: number;
  preferredGender: string | null;
  preferredLanguage: string | null;
  preferredStaffIds: unknown | null;
  excludedStaffIds: unknown | null;
  petsInHome: boolean | null;
  smokingInHome: boolean | null;
  culturalReligiousNotes: string | null;
  communicationNeeds: string | null;
  otherNotes: string | null;
}

export interface ClientRequiredSkills {
  id: number;
  clientId: number;
  skill: string;
}

export interface Clients {
  id: number;
  clientRef: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dob: string | null;
  gender: string | null;
  addressLine1: string | null;
  town: string | null;
  postcode: string | null;
  lat: string | null;
  lng: string | null;
  accessNotes: string | null;
  phone: string | null;
  gpDetails: string | null;
  nextOfKin: unknown | null;
  fundingSource: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  riskLevel: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceDocuments {
  id: number;
  ownerType: string;
  ownerId: number;
  requirementKey: string;
  fileName: string | null;
  fileKey: string | null;
  status: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface ComplianceRequirements {
  id: number;
  key: string;
  label: string;
  appliesTo: string;
  required: boolean | null;
  expiresAfterMonths: number | null;
}

export interface CrmContactRelationships {
  id: number;
  contactId: number;
  relatedContactId: number;
  relationship: string;
}

export interface CrmContacts {
  id: number;
  contactType: string;
  firstName: string;
  lastName: string;
  organisationId: number | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  preferredChannel: string | null;
  communicationNotes: string | null;
  linkedClientId: number | null;
  linkedStaffId: number | null;
  linkedCandidateId: number | null;
  ownerId: number | null;
  lifecycleStage: string | null;
  tags: unknown | null;
  doNotContact: boolean | null;
  source: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmOrganisations {
  id: number;
  name: string;
  type: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CvVersions {
  id: number;
  applicationId: number;
  fileKey: string;
  fileName: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  extractedText: string | null;
  extractStatus: string;
  createdAt: string;
}

export interface DbsVerifications {
  id: number;
  applicationId: number | null;
  staffId: number | null;
  certificateNo: string;
  sightedOriginal: boolean | null;
  updateServiceChecked: boolean | null;
  barredListAdultsChecked: boolean | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface DocumentTemplates {
  id: number;
  kind: string;
  version: number;
  name: string;
  structure: unknown | null;
  exampleText: string | null;
  active: boolean | null;
  createdAt: string;
}

export interface EmailOutbox {
  id: number;
  toEmail: string;
  subject: string;
  bodyText: string | null;
  kind: string;
  status: string;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
}

export interface Incidents {
  id: number;
  clientId: number | null;
  staffId: number | null;
  occurredAt: string;
  category: string;
  description: string;
  severity: string;
  actionsTaken: string | null;
  notifiableToCqc: boolean | null;
  status: string;
  createdAt: string;
}

export interface Interactions {
  id: number;
  type: string;
  direction: string;
  contactId: number | null;
  clientId: number | null;
  ticketId: number | null;
  subject: string | null;
  body: string | null;
  summaryAi: string | null;
  sentiment: string | null;
  occurredAt: string;
  durationSeconds: number | null;
  loggedBy: string | null;
  outcome: string | null;
  createdAt: string;
}

export interface InterviewBookings {
  id: number;
  slotId: number;
  applicationId: number;
  status: string;
  createdAt: string;
}

export interface InterviewScorecards {
  id: number;
  applicationId: number;
  panelMemberId: number;
  scores: unknown | null;
  total: string | null;
  recommendation: string | null;
  submittedAt: string | null;
}

export interface InterviewSlots {
  id: number;
  jobPostingId: number | null;
  startsAt: string;
  endsAt: string;
  panelMemberIds: unknown | null;
  capacity: number | null;
  teamsMeetingUrl: string | null;
  locationText: string | null;
  /** Email candidates who become ready to book after the slot was created. Missing until migration 0003 runs. */
  notifyNewCandidates?: boolean | null;
  createdAt: string;
}

export interface JobLinkSources {
  id: number;
  jobPostingId: number;
  label: string;
  slug: string;
  createdBy: string | null;
  createdAt: string;
}

export interface JobPostings {
  id: number;
  title: string;
  location: string | null;
  postcode: string | null;
  salaryText: string | null;
  employmentType: string;
  descriptionMd: string | null;
  requirements: unknown | null;
  screeningThreshold: number | null;
  status: string;
  closesAt: string | null;
  publicSlug: string;
  createdAt: string;
  updatedAt: string;
  applySlug: string | null;
  applyLinkEnabled: boolean;
  applyLinkCreatedAt: string | null;
  applicationFormId: number | null;
}

export interface Mentions {
  id: number;
  mentionedStaffId: number;
  byName: string | null;
  sourceType: string;
  sourceId: number | null;
  sourceLabel: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Notifications {
  id: number;
  userId: number | null;
  staffId: number | null;
  channel: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface OfferLetters {
  id: number;
  applicationId: number;
  templateVersion: string | null;
  content: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  signatureName: string | null;
  signatureIp: string | null;
  createdAt: string;
}

export interface Organisations {
  id: number;
  name: string;
  cqcLocationId: string | null;
  address: string | null;
  logoUrl: string | null;
  settings: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanReviews {
  id: number;
  planType: string;
  planId: number;
  clientId: number | null;
  dueDate: string;
  trigger: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
}

export interface PreInterviewForms {
  id: number;
  applicationId: number;
  data: unknown | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface RateLimitEvents {
  id: number;
  bucket: string;
  rlKey: string;
  createdAt: string;
}

export interface ReassignmentRequests {
  id: number;
  visitId: number;
  originalStaffId: number;
  reason: string | null;
  requestedBy: string | null;
  status: string;
  resolvedStaffId: number | null;
  resolutionLog: unknown | null;
  createdAt: string;
}

export interface References {
  id: number;
  applicationId: number;
  refereeName: string;
  refereeEmail: string;
  relationship: string | null;
  isMostRecentEmployer: boolean | null;
  status: string;
  response: unknown | null;
  token: string;
  createdAt: string;
}

export interface RotaWeeks {
  id: number;
  weekStartDate: string;
  status: string;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
}

export interface SlaPolicies {
  id: number;
  name: string;
  category: string | null;
  priority: string;
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

export interface StaffAvailability {
  id: number;
  staffId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface StaffProfiles {
  id: number;
  userId: number | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  employeeNo: string | null;
  jobTitle: string | null;
  startDate: string | null;
  employmentType: string | null;
  contractedHours: string | null;
  maxWeeklyHours: string | null;
  homePostcode: string | null;
  lat: string | null;
  lng: string | null;
  drives: boolean | null;
  hasVehicle: boolean | null;
  gender: string | null;
  languages: unknown | null;
  skills: unknown | null;
  wtdOptOut: boolean | null;
  status: string;
  avatarColor: string | null;
  homeRole: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffUnavailability {
  id: number;
  staffId: number;
  startsAt: string;
  endsAt: string;
  reason: string;
  notes: string | null;
  status: string;
  approvedBy: string | null;
  createdAt: string;
}

export interface SupervisorNotes {
  id: number;
  staffId: number;
  supervisorId: number | null;
  supervisorName: string | null;
  clientId: number | null;
  visitId: number | null;
  noteType: string;
  method: string;
  transcript: string | null;
  structured: unknown | null;
  rating: number | null;
  strengths: string | null;
  improvements: string | null;
  actions: unknown | null;
  visibleToStaff: boolean | null;
  createdAt: string;
}

export interface Tasks {
  id: number;
  title: string;
  description: string | null;
  dueAt: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  createdByName: string | null;
  relatedType: string | null;
  relatedId: number | null;
  status: string;
  priority: string;
  createdAt: string;
}

export interface Teams {
  id: number;
  name: string;
  leadId: number | null;
  memberIds: unknown | null;
}

export interface TicketComments {
  id: number;
  ticketId: number;
  authorId: number | null;
  authorName: string;
  body: string;
  visibility: string;
  mentions: unknown | null;
  createdAt: string;
}

export interface TicketEvents {
  id: number;
  ticketId: number;
  actorName: string | null;
  event: string;
  fromValue: string | null;
  toValue: string | null;
  at: string;
}

export interface Tickets {
  id: number;
  ticketNo: string;
  subject: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  channel: string;
  requesterContactId: number | null;
  clientId: number | null;
  staffId: number | null;
  assigneeId: number | null;
  teamId: number | null;
  escalationLevel: number | null;
  dueAt: string | null;
  firstResponseDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionSummary: string | null;
  resolutionCode: string | null;
  satisfactionScore: number | null;
  isFormalComplaint: boolean | null;
  mergedIntoTicketId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketWatchers {
  id: number;
  ticketId: number;
  staffId: number;
  reason: string;
}

export interface TrainingCourses {
  id: number;
  title: string;
  type: string;
  provider: string | null;
  durationHours: string | null;
  mandatory: boolean | null;
  renewEveryMonths: number | null;
}

export interface TrainingEnrolments {
  id: number;
  sessionId: number | null;
  courseId: number;
  personType: string;
  personId: number;
  status: string;
  completedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface TrainingSessions {
  id: number;
  courseId: number;
  startsAt: string;
  endsAt: string;
  location: string | null;
  capacity: number | null;
  trainerName: string | null;
}

export interface TravelCache {
  id: number;
  fromPostcode: string;
  toPostcode: string;
  minutes: number;
  km: string | null;
  source: string | null;
  fetchedAt: string;
}

export interface Users {
  id: number;
  unionId: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  lastSignInAt: string;
}

export interface VisitAssignments {
  id: number;
  visitId: number;
  staffId: number;
  slot: string;
  assignedBy: string;
  assignmentReason: string | null;
  travelMinutesFromPrevious: number | null;
  status: string;
  createdAt: string;
}

export interface Visits {
  id: number;
  rotaWeekId: number;
  clientId: number;
  visitTemplateId: number | null;
  scheduledStart: string;
  scheduledEnd: string;
  callType: string;
  visitType: string | null;
  status: string;
  notes: string | null;
  externalRef: string | null;
  createdAt: string;
}

export interface VisitTemplates {
  id: number;
  carePackageId: number;
  clientId: number;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  callType: string;
  visitType: string;
  tasks: unknown | null;
  flexibilityMinutes: number | null;
}

export type User = Users;
export type InsertUser = Partial<Omit<Users, "lastSignInAt">> & {
  unionId: string;
  lastSignInAt?: string | Date;
};
export type StaffProfile = StaffProfiles;
