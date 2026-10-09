import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, AvatarDot } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StaffRole } from "@db/schema";

const ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: "Registered Manager", admin: "Office / HR Admin", care_coordinator: "Care Coordinator",
  team_leader: "Team Leader", supervisor: "Field Supervisor", interview_panel: "Interview Panel",
  care_worker: "Care Worker", crm_agent: "CRM Agent",
};

export default function StaffDirectory() {
  const q = trpc.core.staffList.useQuery();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  if (q.isLoading) return <Loading rows={8} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  const rows = (q.data ?? []).filter((s) => {
    const matchQ = !search || s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (s.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchR = roleFilter === "all" || s.role === roleFilter;
    return matchQ && matchR;
  });

  return (
    <div>
      <PageHeader
        title="Staff directory"
        subtitle={`${(q.data ?? []).filter((s) => s.status === "active").length} active staff`}
        actions={
          <>
            <Input placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" aria-label="Search staff" />
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
      />
      <div className="uc-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Contact</th>
              <th className="px-4 py-2.5 font-medium">Hours</th>
              <th className="px-4 py-2.5 font-medium">Skills</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-[--brand-50]/60" style={{ borderColor: "var(--line)" }}>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <AvatarDot name={s.fullName} color={s.avatarColor} />
                    <span>
                      <span className="block font-medium text-[--brand-900]">{s.fullName}</span>
                      <span className="block text-xs text-muted-foreground">{s.jobTitle ?? ""}</span>
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2.5">{ROLE_LABELS[s.role as StaffRole] ?? s.role}</td>
                <td className="px-4 py-2.5 text-xs">
                  <span className="block">{s.email}</span>
                  <span className="text-muted-foreground">{s.phone ?? ""}</span>
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {s.contractedHours ?? "—"}h contracted
                  {s.maxWeeklyHours ? ` / ${s.maxWeeklyHours}h max` : ""}
                  {s.wtdOptOut ? <span className="block text-muted-foreground">WTD opt-out</span> : null}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1 max-w-52">
                    {((s.skills as string[]) ?? []).slice(0, 3).map((sk) => (
                      <span key={sk} className="rounded bg-[--brand-100] px-1.5 py-0.5 text-[10px] font-medium text-[--brand-900]">{sk.replace(/_/g, " ")}</span>
                    ))}
                    {((s.skills as string[]) ?? []).length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{((s.skills as string[]) ?? []).length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5"><Chip value={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Start dates, contracts and documents are held on each staff record; staff are never hard-deleted — leavers are marked as “left” and retained for CQC evidence.
      </p>
    </div>
  );
}
