import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, Chip } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STAFF_ROLES, type StaffRole } from "@db/schema";
import { Loader2, Plus, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: "Registered Manager",
  admin: "Office / HR Admin",
  care_coordinator: "Care Coordinator",
  team_leader: "Team Leader",
  supervisor: "Field Supervisor",
  interview_panel: "Interview Panel",
  care_worker: "Care Worker",
  crm_agent: "CRM Agent",
};

const STATUS_LABELS: Record<string, string> = {
  invited: "Invite sent",
  pending: "Awaiting setup",
  active: "Active",
  onboarding: "Onboarding",
  left: "Deactivated",
};

type AccountRow = {
  id: number;
  fullName: string;
  email: string | null;
  role: StaffRole;
  status: string;
  canInviteUsers: boolean;
  createdAt: string;
};

export default function UserManagement() {
  const meQ = trpc.core.me.useQuery();
  const listQ = trpc.core.userAccounts.useQuery();
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [q, setQ] = useState("");

  const actorRole = (meQ.data?.homeRole ?? meQ.data?.role) as StaffRole | undefined;
  const canAssignRm = actorRole === "super_admin";

  const rows = useMemo(() => {
    const all = (listQ.data ?? []) as AccountRow[];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((r) =>
      r.fullName.toLowerCase().includes(needle)
      || (r.email ?? "").toLowerCase().includes(needle)
      || (ROLE_LABELS[r.role] ?? r.role).toLowerCase().includes(needle));
  }, [listQ.data, q]);

  if (listQ.isLoading || meQ.isLoading) return <Loading rows={6} />;
  if (listQ.error) return <ErrorState message={listQ.error.message} onRetry={() => listQ.refetch()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="User management"
        subtitle="Invite people to UniqueCare Connect. They set their own password from the email link."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" /> Invite user
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, or role…"
          className="max-w-sm h-10"
        />
        <p className="text-xs text-muted-foreground">
          {rows.length} account{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="uc-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[--brand-50]/50 text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Can invite</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                <td className="px-4 py-3 font-medium text-[--brand-900]">{r.fullName}</td>
                <td className="px-4 py-3 text-muted-foreground break-all">{r.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <Chip value={r.role} label={ROLE_LABELS[r.role] ?? r.role} />
                </td>
                <td className="px-4 py-3">
                  <Chip value={r.status} label={STATUS_LABELS[r.status] ?? r.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.canInviteUsers ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Manage</Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <p className="font-medium text-[--brand-900]">No accounts yet</p>
                  <p className="mt-1 text-sm">Invite your first team member — they will get an email to set a password.</p>
                  <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> Invite user
                  </Button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <InviteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canAssignRm={!!canAssignRm}
        onDone={() => { utils.core.userAccounts.invalidate(); setCreateOpen(false); }}
      />
      {editing && (
        <ManageDialog
          account={editing}
          canAssignRm={!!canAssignRm}
          selfId={meQ.data?.id}
          onClose={() => setEditing(null)}
          onDone={() => { utils.core.userAccounts.invalidate(); setEditing(null); }}
        />
      )}
    </div>
  );
}

function InviteDialog({
  open, onOpenChange, canAssignRm, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canAssignRm: boolean;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("care_worker");
  const [canInvite, setCanInvite] = useState(false);

  const invite = trpc.core.inviteStaff.useMutation({
    onSuccess: () => {
      toast.success("Invite sent — they will set their password from the email");
      setFullName(""); setEmail(""); setRole("care_worker"); setCanInvite(false);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const roles = STAFF_ROLES.filter((r) => canAssignRm || r !== "super_admin");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We email them a secure link to choose a password. Role and invite rights are set here — you can change them later.
        </p>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Full name</Label>
            <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11" autoComplete="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Work email</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border px-3 py-3" style={{ borderColor: "var(--line)" }}>
            <div>
              <p className="text-sm font-medium text-[--brand-900]">Can invite other users</p>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                Lets them open User management and send invites. You can revoke this anytime.
              </p>
            </div>
            <Switch
              checked={role === "super_admin" ? true : canInvite}
              disabled={role === "super_admin"}
              onCheckedChange={setCanInvite}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={invite.isPending || fullName.trim().length < 2 || !email.includes("@")}
            onClick={() => invite.mutate({
              fullName: fullName.trim(),
              email: email.trim(),
              role,
              canInviteUsers: role === "super_admin" ? true : canInvite,
            })}
          >
            {invite.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageDialog({
  account, canAssignRm, selfId, onClose, onDone,
}: {
  account: AccountRow;
  canAssignRm: boolean;
  selfId?: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [role, setRole] = useState<StaffRole>(account.role);
  const [canInvite, setCanInvite] = useState(account.canInviteUsers);
  const isSelf = selfId === account.id;

  const update = trpc.core.updateUserAccess.useMutation({
    onSuccess: () => { toast.success("Access updated"); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  const resend = trpc.core.resendStaffInvite.useMutation({
    onSuccess: () => toast.success("Invite email resent"),
    onError: (e) => toast.error(e.message),
  });

  const roles = STAFF_ROLES.filter((r) => canAssignRm || r !== "super_admin");
  const awaiting = account.status === "invited" || account.status === "pending";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account.fullName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground break-all">{account.email}</p>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)} disabled={isSelf}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border px-3 py-3" style={{ borderColor: "var(--line)" }}>
            <div>
              <p className="text-sm font-medium text-[--brand-900]">Can invite other users</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Turn off to revoke User management access.</p>
            </div>
            <Switch
              checked={role === "super_admin" ? true : canInvite}
              disabled={role === "super_admin" || isSelf}
              onCheckedChange={setCanInvite}
            />
          </div>
          {awaiting && (
            <Button
              variant="outline"
              className="w-full"
              disabled={resend.isPending}
              onClick={() => resend.mutate({ id: account.id })}
            >
              {resend.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Resend invite email
            </Button>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {!isSelf && account.status !== "left" && (
            <Button
              variant="destructive"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: account.id, status: "left", canInviteUsers: false })}
            >
              Deactivate
            </Button>
          )}
          {account.status === "left" && (
            <Button
              variant="outline"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: account.id, status: "active" })}
            >
              Reactivate
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              disabled={update.isPending || isSelf}
              onClick={() => update.mutate({
                id: account.id,
                role: role !== account.role ? role : undefined,
                canInviteUsers: canInvite,
              })}
            >
              {update.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
