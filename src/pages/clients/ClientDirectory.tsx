import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const SKILLS = ["personal_care", "medication_prompt", "moving_handling", "dementia", "palliative", "peg_feeding", "catheter_care", "diabetes_care", "double_handed"];

export default function ClientDirectory() {
  const utils = trpc.useUtils();
  const q = trpc.rota.clients.useQuery();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  if (q.isLoading) return <Loading rows={8} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  const rows = (q.data ?? []).filter((c) =>
    !search || `${c.firstName} ${c.lastName} ${c.clientRef} ${c.postcode}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${(q.data ?? []).filter((c) => c.status === "active").length} receiving care`}
        actions={
          <>
            <Input placeholder="Search name, ref, postcode…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-60" aria-label="Search clients" />
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New client</Button>
          </>
        }
      />
      <div className="uc-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="px-4 py-2.5 font-medium">Postcode</th>
              <th className="px-4 py-2.5 font-medium">Funding</th>
              <th className="px-4 py-2.5 font-medium">Hours/wk</th>
              <th className="px-4 py-2.5 font-medium">Risk</th>
              <th className="px-4 py-2.5 font-medium">Required skills</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-[--brand-50]/60" style={{ borderColor: "var(--line)" }}>
                <td className="px-4 py-2.5">
                  <Link to={`/clients/${c.id}`} className="uc-focus font-medium text-[--brand-900] hover:text-[--brand-600]">
                    {c.firstName} {c.lastName}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{c.clientRef}</span>
                </td>
                <td className="px-4 py-2.5 text-xs">{c.postcode}</td>
                <td className="px-4 py-2.5 text-xs">{(c.fundingSource ?? "").replace(/_/g, " ")}</td>
                <td className="px-4 py-2.5 text-xs">{c.package?.commissionedHoursPerWeek ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <Chip value={c.riskLevel === "high" ? "urgent" : c.riskLevel === "medium" ? "high" : "low"} label={c.riskLevel} />
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1 max-w-56">
                    {(c.requiredSkills ?? []).slice(0, 3).map((sk) => (
                      <span key={sk} className="rounded bg-[--brand-100] px-1.5 py-0.5 text-[10px] font-medium text-[--brand-900]">{sk.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5"><Chip value={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CreateClientDialog open={open} onClose={() => setOpen(false)} onCreated={() => { utils.rota.clients.invalidate(); setOpen(false); }} />
    </div>
  );
}

function CreateClientDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({
    firstName: "", lastName: "", dob: "", gender: "", addressLine1: "", town: "Birmingham", postcode: "",
    phone: "", fundingSource: "local_authority" as string, riskLevel: "low" as string,
    accessNotes: "", preferredGender: "any" as string, commissionedHoursPerWeek: 10,
  });
  const [skills, setSkills] = useState<string[]>([]);
  const create = trpc.rota.createClient.useMutation({
    onSuccess: () => { toast.success("Client created"); onCreated(); },
    onError: (e) => toast.error(e.message),
  });
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="c-fn">First name</Label><Input id="c-fn" value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></div>
          <div><Label htmlFor="c-ln">Last name</Label><Input id="c-ln" value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
          <div><Label htmlFor="c-dob">Date of birth</Label><Input id="c-dob" type="date" value={f.dob} onChange={(e) => set("dob", e.target.value)} /></div>
          <div>
            <Label>Gender</Label>
            <Select value={f.gender} onValueChange={(v) => set("gender", v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="other">Another gender</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label htmlFor="c-ad">Address</Label><Input id="c-ad" value={f.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} /></div>
          <div><Label htmlFor="c-town">Town</Label><Input id="c-town" value={f.town} onChange={(e) => set("town", e.target.value)} /></div>
          <div><Label htmlFor="c-pc">Postcode</Label><Input id="c-pc" value={f.postcode} onChange={(e) => set("postcode", e.target.value)} placeholder="B23 6AA" /></div>
          <div><Label htmlFor="c-ph">Phone</Label><Input id="c-ph" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div>
            <Label>Funding source</Label>
            <Select value={f.fundingSource} onValueChange={(v) => set("fundingSource", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="local_authority">Local authority</SelectItem>
                <SelectItem value="nhs_chc">NHS CHC</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Risk level</Label>
            <Select value={f.riskLevel} onValueChange={(v) => set("riskLevel", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Preferred carer gender</Label>
            <Select value={f.preferredGender} onValueChange={(v) => set("preferredGender", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">No preference</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="c-hrs">Commissioned hours / week</Label>
            <Input id="c-hrs" type="number" min={0.5} step={0.5} value={f.commissionedHoursPerWeek}
              onChange={(e) => set("commissionedHoursPerWeek", Number(e.target.value))} />
          </div>
          <div className="col-span-2"><Label htmlFor="c-an">Access notes (keysafe, entry instructions)</Label><Input id="c-an" value={f.accessNotes} onChange={(e) => set("accessNotes", e.target.value)} /></div>
        </div>
        <div className="mt-3">
          <Label>Required skills</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {SKILLS.map((sk) => (
              <label key={sk} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer" style={{ borderColor: "var(--line)" }}>
                <Checkbox checked={skills.includes(sk)}
                  onCheckedChange={(v) => setSkills((s) => v === true ? [...s, sk] : s.filter((x) => x !== sk))} />
                {sk.replace(/_/g, " ")}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!f.firstName || !f.lastName || !f.addressLine1 || f.postcode.length < 4 || create.isPending}
            onClick={() => create.mutate({
              firstName: f.firstName, lastName: f.lastName, dob: f.dob || undefined,
              gender: f.gender || undefined, addressLine1: f.addressLine1, town: f.town,
              postcode: f.postcode, phone: f.phone || undefined,
              fundingSource: f.fundingSource as never, riskLevel: f.riskLevel as never,
              accessNotes: f.accessNotes || undefined, requiredSkills: skills,
              preferredGender: f.preferredGender as never,
              commissionedHoursPerWeek: f.commissionedHoursPerWeek,
            })}>
            Create client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
