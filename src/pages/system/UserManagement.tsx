import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, Chip } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STAFF_ROLES, type StaffRole } from "@db/schema";
import { Check, Copy, KeyRound, Loader2, Plus, UserPlus } from "lucide-react";
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
  createdAt: string;
};

function clientPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let body = "";
  for (const b of bytes) body += alphabet[b % alphabet.length];
  return `Uc${body}!9`;
}

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
        subtitle="Create accounts with a work email and password. Share the password with them directly — no invite email required."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" /> Create account
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
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Manage</Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <p className="font-medium text-[--brand-900]">No accounts yet</p>
                  <p className="mt-1 text-sm">Create an account with their work email and a password they can use to sign in.</p>
                  <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> Create account
                  </Button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateAccountDialog
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

function CredentialBanner({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const text = `${email}\n${password}`;
  return (
    <div className="rounded-xl border border-[--brand-200] bg-[--brand-50] px-3 py-3 text-sm">
      <p className="font-medium text-[--brand-900]">Share these sign-in details now</p>
      <p className="mt-1 text-xs text-muted-foreground">They will not be shown again. Pass them securely (in person, Teams, etc.).</p>
      <p className="mt-2 break-all font-mono text-xs text-[--brand-900]">{email}</p>
      <p className="mt-1 break-all font-mono text-xs text-[--brand-900]">{password}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success("Copied email and password");
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
        Copy
      </Button>
    </div>
  );
}

function CreateAccountDialog({
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
  const [password, setPassword] = useState(() => clientPassword());
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const utils = trpc.useUtils();

  const create = trpc.core.createStaffAccount.useMutation({
    onSuccess: (res) => {
      setCreatedCreds({ email: res.email, password: res.password });
      void utils.core.userAccounts.invalidate();
      toast.success("Account created — share the password with them");
    },
    onError: (e) => toast.error(e.message),
  });

  const roles = STAFF_ROLES.filter((r) => canAssignRm || r !== "super_admin");

  const close = (v: boolean) => {
    if (!v) {
      const hadCreds = !!createdCreds;
      setFullName(""); setEmail(""); setRole("care_worker");
      setPassword(clientPassword()); setCreatedCreds(null);
      if (hadCreds) onDone();
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{createdCreds ? "Account ready" : "Create account"}</DialogTitle>
        </DialogHeader>
        {createdCreds ? (
          <div className="space-y-4">
            <CredentialBanner email={createdCreds.email} password={createdCreds.password} />
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Enter their work email and set a password. They can sign in immediately — no email invite is sent.
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
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="invite-password">Password</Label>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[--brand-700] hover:underline"
                    onClick={() => setPassword(clientPassword())}
                  >
                    Generate
                  </button>
                </div>
                <Input
                  id="invite-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 font-mono text-sm"
                  autoComplete="new-password"
                />
                <p className="text-[11px] text-muted-foreground">At least 8 characters. Share this with them securely.</p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button
                disabled={create.isPending || fullName.trim().length < 2 || !email.includes("@") || password.trim().length < 8}
                onClick={() => create.mutate({
                  fullName: fullName.trim(),
                  email: email.trim(),
                  role,
                  password: password.trim(),
                  canInviteUsers: role === "super_admin",
                })}
              >
                {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Create account
              </Button>
            </DialogFooter>
          </>
        )}
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
  const [password, setPassword] = useState(() => clientPassword());
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const isSelf = selfId === account.id;

  const update = trpc.core.updateUserAccess.useMutation({
    onSuccess: () => { toast.success("Access updated"); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  const setPw = trpc.core.setStaffPassword.useMutation({
    onSuccess: (res) => {
      setIssued({ email: res.email, password: res.password });
      toast.success("Password updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const roles = STAFF_ROLES.filter((r) => canAssignRm || r !== "super_admin");

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { if (issued) onDone(); else onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account.fullName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground break-all">{account.email}</p>

        {issued ? (
          <div className="space-y-4 pt-1">
            <CredentialBanner email={issued.email} password={issued.password} />
            <DialogFooter>
              <Button onClick={onDone}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
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
              <div className="space-y-1.5 rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="reset-password">Set new password</Label>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[--brand-700] hover:underline"
                    onClick={() => setPassword(clientPassword())}
                  >
                    Generate
                  </button>
                </div>
                <Input
                  id="reset-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 h-11 font-mono text-sm"
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 w-full"
                  disabled={setPw.isPending || password.trim().length < 8}
                  onClick={() => setPw.mutate({ id: account.id, password: password.trim() })}
                >
                  {setPw.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <KeyRound className="mr-1.5 h-4 w-4" />}
                  Save password
                </Button>
              </div>
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
                    canInviteUsers: role === "super_admin",
                  })}
                >
                  {update.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
