import type { StaffRole } from "@db/schema";

/** Keep aligned with api/util.ts role sets and AppLayout nav. */
export const ROTA_PLANNER_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader"];
export const ROTA_WRITE_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator"];
export const PAYROLL_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader"];
export const COMPLIANCE_MATRIX_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader"];
export const STAFF_DIRECTORY_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader", "supervisor"];
export const CLIENT_DIRECTORY_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader", "supervisor", "crm_agent"];
export const CQC_READINESS_ROLES: StaffRole[] = ["super_admin", "admin", "team_leader", "care_coordinator"];
export const CQC_INCIDENT_ROLES: StaffRole[] = ["super_admin", "admin", "team_leader", "supervisor"];
/** Care/support plans + plan reviews — managers (RM), admin, team leaders, coordinators. */
export const CQC_PLAN_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader"];
/** Create, AI generate, approve — same as CQC_PLAN_ROLES. */
export const CQC_PLAN_WRITE_ROLES: StaffRole[] = CQC_PLAN_ROLES;
export const OFFICE_ROLES: StaffRole[] = ["super_admin", "admin"];
export const RECRUITMENT_ROLES: StaffRole[] = ["super_admin", "admin"];
export const INTERVIEW_ROLES: StaffRole[] = ["super_admin", "admin", "interview_panel", "team_leader"];
export const TIMESHEET_ROLES: StaffRole[] = [
  "super_admin", "admin", "care_coordinator", "care_worker", "team_leader", "supervisor",
];
/** Admin/manager payroll board (not the carer's own "My timesheet"). */
export const PAYROLL_VIEW_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader"];

export function roleAllowed(role: string | null | undefined, allowed: StaffRole[]): boolean {
  return !!role && allowed.includes(role as StaffRole);
}
