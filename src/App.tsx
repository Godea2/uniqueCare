import { Routes, Route, Navigate } from "react-router";
import AppLayout from "./components/AppLayout";
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
import Training from "./pages/recruitment/Training";

import StaffDirectory from "./pages/staff/StaffDirectory";
import ComplianceMatrix from "./pages/staff/ComplianceMatrix";
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

function P({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
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
      <Route path="/" element={<P><Dashboard /></P>} />
      <Route path="/recruitment/jobs" element={<P><Jobs /></P>} />
      <Route path="/recruitment/forms" element={<P><ApplicationForms /></P>} />
      <Route path="/recruitment/pipeline" element={<P><Pipeline /></P>} />
      <Route path="/recruitment/pipeline/:id" element={<P><CandidateDetail /></P>} />
      <Route path="/recruitment/interviews" element={<P><Interviews /></P>} />
      <Route path="/recruitment/compliance" element={<P><ComplianceQueue /></P>} />
      <Route path="/recruitment/training" element={<P><Training /></P>} />

      <Route path="/staff" element={<P><StaffDirectory /></P>} />
      <Route path="/staff/compliance" element={<P><ComplianceMatrix /></P>} />
      <Route path="/staff/supervision" element={<P><Supervision /></P>} />
      <Route path="/staff/appraisals" element={<P><Appraisals /></P>} />

      <Route path="/clients" element={<P><ClientDirectory /></P>} />
      <Route path="/clients/care-plans" element={<P><Plans kind="care" /></P>} />
      <Route path="/clients/support-plans" element={<P><Plans kind="support" /></P>} />
      <Route path="/clients/plans/:id" element={<P><PlanEditor /></P>} />
      <Route path="/clients/reviews" element={<P><Reviews /></P>} />
      <Route path="/clients/change-events" element={<P><ChangeEvents /></P>} />
      <Route path="/clients/:id" element={<P><ClientDetail /></P>} />

      <Route path="/rota" element={<P><WeekPlanner /></P>} />
      <Route path="/rota/reassignments" element={<P><Reassignments /></P>} />
      <Route path="/me" element={<P><MyRota /></P>} />

      <Route path="/crm/tickets" element={<P><Tickets /></P>} />
      <Route path="/crm/tickets/:id" element={<P><TicketDetail /></P>} />
      <Route path="/crm/contacts" element={<P><Contacts /></P>} />
      <Route path="/crm/contacts/:id" element={<P><ContactDetail /></P>} />
      <Route path="/crm/tasks" element={<P><Tasks /></P>} />
      <Route path="/crm/reports" element={<P><CrmReports /></P>} />

      <Route path="/cqc" element={<P><Readiness /></P>} />
      <Route path="/cqc/incidents" element={<P><Incidents /></P>} />
      <Route path="/cqc/inspection-pack" element={<P><InspectionPack /></P>} />

      <Route path="/settings" element={<P><Settings /></P>} />
      <Route path="/audit" element={<P><AuditLog /></P>} />

      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
