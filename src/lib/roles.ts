import type { StaffRole } from "@db/schema";

/** Keep aligned with api/util.ts role sets and AppLayout nav. */
export const ROTA_PLANNER_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader"];
export const ROTA_WRITE_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator"];
export const PAYROLL_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader"];
export const COMPLIANCE_MATRIX_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader"];
export const STAFF_DIRECTORY_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader", "supervisor"];
export const CLIENT_DIRECTORY_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader", "supervisor", "crm_agent"];
export const CQC_READINESS_ROLES: StaffRole[] = ["super_admin", "admin", "team_leader"];
export const CQC_INCIDENT_ROLES: StaffRole[] = ["super_admin", "admin", "team_leader", "supervisor"];
export const OFFICE_ROLES: StaffRole[] = ["super_admin", "admin"];
export const RECRUITMENT_ROLES: StaffRole[] = ["super_admin", "admin"];
export const INTERVIEW_ROLES: StaffRole[] = ["super_admin", "admin", "interview_panel", "team_leader"];
export const TIMESHEET_ROLES: StaffRole[] = [
  "super_admin", "admin", "care_coordinator", "care_worker", "team_leader", "supervisor",
];

export function roleAllowed(role: string | null | undefined, allowed: StaffRole[]): boolean {
  return !!role && allowed.includes(role as StaffRole);
}
