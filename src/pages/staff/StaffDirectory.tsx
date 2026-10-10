import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, AvatarDot } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StaffProfiles, StaffRole } from "@db/schema";

const ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: "Registered Manager", admin: "Office / HR Admin", care_coordinator: "Care Coordinator",
  team_leader: "Team Leader", supervisor: "Field Supervisor", interview_panel: "Interview Panel",
  care_worker: "Care Worker", crm_agent: "CRM Agent",
};

const STATUS_LABELS = {
  active: "Active",
  onboarding: "Onboarding (not offered visits yet)",
  pending: "Awaiting approval (no access)",
  left: "Left (no access, record kept)",
} as const;
type StaffStatus = keyof typeof STATUS_LABELS;

export default function StaffDirectory() {
  const q = trpc.core.staffList.useQuery();
  const meQ = trpc.core.me.useQuery();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editing, setEditing] = useState<StaffProfiles | null>(null);

  if (q.isLoading) return <Loading rows={8} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  const myRealRole = meQ.data?.homeRole ?? meQ.data?.role;
  const canManage = myRealRole === "super_admin" || myRealRole === "admin";
  const all = q.data ?? [];
  const pendingCount = all.filter((s) => s.status === "pending").length;
  const rows = all.filter((s) => {
    const matchQ = !search || s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (s.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchR = roleFilter === "all" || (roleFilter === "pending" ? s.status === "pending" : s.role === roleFilter);
    return matchQ && matchR;
  }).sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));

  return (
    <div>
      <PageHeader
        title="Staff directory"
        subtitle={`${all.filter((s) => s.status === "active").length} active staff${pendingCount ? ` · ${pendingCount} awaiting approval` : ""}`}
        actions={
          <>
            <Input placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" aria-label="Search staff" />
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="pending">Awaiting approval</SelectItem>
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
              {canManage && <th className="px-4 py-2.5 font-medium sr-only">Actions</th>}
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
                <td className="px-4 py-2.5">
                  {ROLE_LABELS[(s.homeRole ?? s.role) as StaffRole] ?? s.role}
                  {s.homeRole && <span className="block text-[10px] text-muted-foreground">previewing as {ROLE_LABELS[s.role as StaffRole] ?? s.role}</span>}
                </td>
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
                <td className="px-4 py-2.5"><Chip value={s.status} label={s.status === "pending" ? "awaiting approval" : undefined} /></td>
                {canManage && (
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant={s.status === "pending" ? "default" : "outline"} onClick={() => setEditing(s)}>
                      {s.status === "pending" ? "Review" : "Manage"}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        New sign-ups wait here until a manager gives them a role. Staff are never hard-deleted — leavers are marked as “left” and retained for CQC evidence.
      </p>
      {editing && (
        <ManageStaffDialog
          staff={editing}
          canAssignManager={myRealRole === "super_admin"}
          isSelf={editing.id === meQ.data?.id}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ManageStaffDialog({ staff, canAssignManager, isSelf, onClose }: {
  staff: StaffProfiles;
  canAssignManager: boolean;
  isSelf: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const currentRole = (staff.homeRole ?? staff.role) as StaffRole;
  const [role, setRole] = useState<StaffRole>(currentRole);
  const [status, setStatus] = useState<StaffStatus>(
    staff.status === "pending" ? "active" : (staff.status in STATUS_LABELS ? staff.status as StaffStatus : "active"),
  );
  const [jobTitle, setJobTitle] = useState(staff.jobTitle ?? "");
  const [hours, setHours] = useState(staff.contractedHours ?? "37.5");
  const update = trpc.core.updateStaff.useMutation({
    onSuccess: () => {
      toast.success(staff.status === "pending" && status === "active" ? `${staff.fullName} now has access` : "Staff record updated");
      utils.core.staffList.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const lockedManager = currentRole === "super_admin" && !canAssignManager;
  const hoursNum = Number(hours);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{staff.status === "pending" ? "Approve new account" : `Manage ${staff.fullName}`}</DialogTitle>
          <DialogDescription>{staff.email}</DialogDescription>
        </DialogHeader>
        {lockedManager ? (
          <p className="text-sm text-muted-foreground">Only a Registered Manager can change another Registered Manager's account.</p>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as StaffRole)} disabled={isSelf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as StaffRole[])
                    .filter((r) => canAssignManager || r !== "super_admin")
                    .map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">The role decides which menus and records they can see.</p>
            </div>
            <div className="grid gap-1.5">
              <Label>Account status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StaffStatus)} disabled={isSelf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as StaffStatus[]).map((k) => <SelectItem key={k} value={k}>{STATUS_LABELS[k]}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Only active staff are offered visits on the rota.</p>
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="staff-title">Job title</Label>
                <Input id="staff-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Care Worker" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="staff-hours">Hours / week</Label>
                <Input id="staff-hours" type="number" min={0} max={60} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {!lockedManager && (
            <Button
              disabled={update.isPending || !Number.isFinite(hoursNum) || hoursNum < 0 || hoursNum > 60}
              onClick={() => update.mutate({
                id: staff.id,
                role: role !== currentRole ? role : undefined,
                status: status !== staff.status ? status : undefined,
                jobTitle,
                contractedHours: hoursNum,
              })}
            >
              {update.isPending ? "Saving…" : staff.status === "pending" ? "Approve" : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
