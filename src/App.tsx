import { Routes, Route, Navigate } from "react-router";
import AppLayout from "./components/AppLayout";
import RequireRoles from "./components/RequireRoles";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import SetPassword from "./pages/SetPassword";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";

import Jobs from "./pages/recruitment/Jobs";
import ApplicationForms from "./pages/recruitment/ApplicationForms";
import Pipeline from "./pages/recruitment/Pipeline";
import CandidateDetail from "./pages/recruitment/CandidateDetail";
import Interviews from "./pages/recruitment/Interviews";
import ComplianceQueue from "./pages/recruitment/ComplianceQueue";
import OutgoingDocuments from "./pages/recruitment/OutgoingDocuments";
import Training from "./pages/recruitment/Training";

import StaffDirectory from "./pages/staff/StaffDirectory";
import StaffDetail from "./pages/staff/StaffDetail";
import ComplianceMatrix from "./pages/staff/ComplianceMatrix";
import ExpiryDashboard from "./pages/staff/ExpiryDashboard";
import Supervision from "./pages/staff/Supervision";
import Appraisals from "./pages/staff/Appraisals";

import ClientDirectory from "./pages/clients/ClientDirectory";
import ClientDetail from "./pages/clients/ClientDetail";
import Plans from "./pages/clients/Plans";
import PlanEditor from "./pages/clients/PlanEditor";
import Reviews from "./pages/clients/Reviews";
import ChangeEvents from "./pages/clients/ChangeEvents";

import WeekPlanner from "./pages/rota/WeekPlanner";
import Reassignments from "./pages/rota/Reassignments";
import MyRota from "./pages/rota/MyRota";
import Timesheets from "./pages/rota/Timesheets";

import Tickets from "./pages/crm/Tickets";
import TicketDetail from "./pages/crm/TicketDetail";
import Contacts from "./pages/crm/Contacts";
import ContactDetail from "./pages/crm/ContactDetail";
import Tasks from "./pages/crm/Tasks";
import CrmReports from "./pages/crm/CrmReports";

import Readiness from "./pages/cqc/Readiness";
import Incidents from "./pages/cqc/Incidents";
import InspectionPack from "./pages/cqc/InspectionPack";

import Settings from "./pages/system/Settings";
import AuditLog from "./pages/system/AuditLog";

import Careers from "./pages/public/Careers";
import Apply from "./pages/public/Apply";
import Portal from "./pages/public/Portal";
import TrainingRegister from "./pages/public/TrainingRegister";

import {
  OFFICE_ROLES,
  RECRUITMENT_ROLES,
  INTERVIEW_ROLES,
  STAFF_DIRECTORY_ROLES,
  COMPLIANCE_MATRIX_ROLES,
  CLIENT_DIRECTORY_ROLES,
  ROTA_PLANNER_ROLES,
  TIMESHEET_ROLES,
  PAYROLL_VIEW_ROLES,
  CQC_READINESS_ROLES,
  CQC_INCIDENT_ROLES,
} from "./lib/roles";
import type { StaffRole } from "@db/schema";

const SUPERVISION_ROLES: StaffRole[] = ["super_admin", "admin", "team_leader", "supervisor"];
const CARE_PLAN_ROLES: StaffRole[] = ["super_admin", "admin", "team_leader", "care_coordinator"];
const SUPPORT_PLAN_ROLES: StaffRole[] = ["super_admin", "admin", "team_leader"];
const REVIEW_ROLES: StaffRole[] = ["super_admin", "admin", "team_leader", "care_coordinator"];
const CRM_ROLES: StaffRole[] = ["super_admin", "admin", "crm_agent", "care_coordinator", "team_leader"];
const CRM_REPORT_ROLES: StaffRole[] = ["super_admin", "admin", "team_leader", "crm_agent", "care_coordinator"];
const ALL_ROLES: StaffRole[] = [
  "super_admin", "admin", "care_coordinator", "team_leader", "supervisor",
  "interview_panel", "care_worker", "crm_agent",
];

function P({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}

function Guard({ roles, children }: { roles: StaffRole[]; children: React.ReactNode }) {
  return (
    <P>
      <RequireRoles roles={roles}>{children}</RequireRoles>
    </P>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/set-password" element={<SetPassword />} />
      <Route path="/careers" element={<Careers />} />
      <Route path="/apply/:slug" element={<Apply />} />
      <Route path="/careers/apply/:slug" element={<Apply />} />
      <Route path="/portal/:token" element={<Portal />} />
      <Route path="/training/register/:token" element={<TrainingRegister />} />

      {/* Authenticated app */}
      <Route path="/" element={<Guard roles={ALL_ROLES}><Dashboard /></Guard>} />
      <Route path="/recruitment/jobs" element={<Guard roles={RECRUITMENT_ROLES}><Jobs /></Guard>} />
      <Route path="/recruitment/forms" element={<Guard roles={RECRUITMENT_ROLES}><ApplicationForms /></Guard>} />
      <Route path="/recruitment/pipeline" element={<Guard roles={RECRUITMENT_ROLES}><Pipeline /></Guard>} />
      <Route path="/recruitment/pipeline/:id" element={<Guard roles={RECRUITMENT_ROLES}><CandidateDetail /></Guard>} />
      <Route path="/recruitment/interviews" element={<Guard roles={INTERVIEW_ROLES}><Interviews /></Guard>} />
      <Route path="/recruitment/compliance" element={<Guard roles={RECRUITMENT_ROLES}><ComplianceQueue /></Guard>} />
      <Route path="/recruitment/outgoing-documents" element={<Guard roles={RECRUITMENT_ROLES}><OutgoingDocuments /></Guard>} />
      <Route path="/recruitment/training" element={<Guard roles={RECRUITMENT_ROLES}><Training /></Guard>} />

      <Route path="/staff" element={<Guard roles={STAFF_DIRECTORY_ROLES}><StaffDirectory /></Guard>} />
      <Route path="/staff/compliance" element={<Guard roles={COMPLIANCE_MATRIX_ROLES}><ComplianceMatrix /></Guard>} />
      <Route path="/staff/expiry" element={<Guard roles={COMPLIANCE_MATRIX_ROLES}><ExpiryDashboard /></Guard>} />
      <Route path="/staff/supervision" element={<Guard roles={SUPERVISION_ROLES}><Supervision /></Guard>} />
      <Route path="/staff/appraisals" element={<Guard roles={CQC_READINESS_ROLES}><Appraisals /></Guard>} />
      <Route path="/staff/:id" element={<P><StaffDetail /></P>} />

      <Route path="/clients" element={<Guard roles={CLIENT_DIRECTORY_ROLES}><ClientDirectory /></Guard>} />
      <Route path="/clients/care-plans" element={<Guard roles={CARE_PLAN_ROLES}><Plans kind="care" /></Guard>} />
      <Route path="/clients/support-plans" element={<Guard roles={SUPPORT_PLAN_ROLES}><Plans kind="support" /></Guard>} />
      <Route path="/clients/plans/:id" element={<Guard roles={CARE_PLAN_ROLES}><PlanEditor /></Guard>} />
      <Route path="/clients/reviews" element={<Guard roles={REVIEW_ROLES}><Reviews /></Guard>} />
      <Route path="/clients/change-events" element={<Guard roles={CQC_READINESS_ROLES}><ChangeEvents /></Guard>} />
      <Route path="/clients/:id" element={<Guard roles={CLIENT_DIRECTORY_ROLES}><ClientDetail /></Guard>} />

      <Route path="/rota" element={<Guard roles={ROTA_PLANNER_ROLES}><WeekPlanner /></Guard>} />
      <Route path="/rota/reassignments" element={<Guard roles={ROTA_PLANNER_ROLES}><Reassignments /></Guard>} />
      <Route path="/rota/timesheets" element={<Guard roles={PAYROLL_VIEW_ROLES}><Timesheets /></Guard>} />
      <Route path="/me/timesheet" element={<Guard roles={TIMESHEET_ROLES}><Timesheets forceMine /></Guard>} />
      <Route path="/me" element={<Guard roles={ALL_ROLES}><MyRota /></Guard>} />

      <Route path="/crm/tickets" element={<Guard roles={CRM_ROLES}><Tickets /></Guard>} />
      <Route path="/crm/tickets/:id" element={<Guard roles={CRM_ROLES}><TicketDetail /></Guard>} />
      <Route path="/crm/contacts" element={<Guard roles={CRM_ROLES}><Contacts /></Guard>} />
      <Route path="/crm/contacts/:id" element={<Guard roles={CRM_ROLES}><ContactDetail /></Guard>} />
      <Route path="/crm/tasks" element={<Guard roles={ALL_ROLES}><Tasks /></Guard>} />
      <Route path="/crm/reports" element={<Guard roles={CRM_REPORT_ROLES}><CrmReports /></Guard>} />

      <Route path="/cqc" element={<Guard roles={CQC_READINESS_ROLES}><Readiness /></Guard>} />
      <Route path="/cqc/incidents" element={<Guard roles={CQC_INCIDENT_ROLES}><Incidents /></Guard>} />
      <Route path="/cqc/inspection-pack" element={<Guard roles={OFFICE_ROLES}><InspectionPack /></Guard>} />

      <Route path="/settings" element={<Guard roles={["super_admin"]}><Settings /></Guard>} />
      <Route path="/audit" element={<Guard roles={OFFICE_ROLES}><AuditLog /></Guard>} />

      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
