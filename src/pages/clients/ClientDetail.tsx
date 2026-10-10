import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, fmtDate, fmtTime, AvatarDot } from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Trash2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function VisitPatternForm({ clientId, onSaved }: { clientId: number; onSaved: () => void }) {
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [startTime, setStartTime] = useState("08:00");
  const [duration, setDuration] = useState(30);
  const [visitType, setVisitType] = useState("personal care");
  const [callType, setCallType] = useState<"single" | "double">("single");
  const add = trpc.rota.addVisitTemplate.useMutation({
    onSuccess: () => { onSaved(); toast.success("Regular visit added"); },
    onError: (e) => toast.error(e.message),
  });
  const toggle = (d: number) => setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort()));
  return (
    <section className="uc-card p-5">
      <h2 className="uc-label mb-3">Add a regular visit</h2>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
        {DAYS.map((label, d) => (
          <button key={label} type="button" aria-pressed={days.includes(d)} onClick={() => toggle(d)}
            className={`rounded-lg border px-2.5 py-1 text-xs uc-focus ${days.includes(d) ? "bg-[--brand-600] text-white border-[--brand-600]" : "bg-white hover:bg-[--brand-50]"}`}
            style={{ borderColor: days.includes(d) ? undefined : "var(--line)" }}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div><Label htmlFor="vt-start">Start</Label><Input id="vt-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
        <div><Label htmlFor="vt-dur">Minutes</Label><Input id="vt-dur" type="number" min={15} max={720} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></div>
        <div><Label htmlFor="vt-type">Visit type</Label><Input id="vt-type" value={visitType} onChange={(e) => setVisitType(e.target.value)} /></div>
        <div>
          <Label htmlFor="vt-call">Carers</Label>
          <Select value={callType} onValueChange={(v) => setCallType(v as "single" | "double")}>
            <SelectTrigger id="vt-call"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="single">One carer</SelectItem>
              <SelectItem value="double">Two carers (double-handed)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button className="mt-3" size="sm"
        disabled={days.length === 0 || !startTime || duration < 15 || visitType.trim().length < 2 || add.isPending}
        onClick={() => add.mutate({ clientId, days, startTime, durationMinutes: duration, visitType: visitType.trim(), callType })}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add visit
      </Button>
    </section>
  );
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const q = trpc.rota.clientDetail.useQuery({ id: Number(id) });
  const remove = trpc.rota.removeVisitTemplate.useMutation({
    onSuccess: () => { q.refetch(); toast.success("Visit removed"); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const c = d.client;

  return (
    <div className="space-y-5">
      <Link to="/clients" className="inline-flex items-center gap-1 text-sm text-[--brand-600] hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Clients
      </Link>
      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        subtitle={`${c.clientRef} · ${c.addressLine1}, ${c.town}, ${c.postcode}`}
        actions={<Chip value={c.status} />}
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="visits">Visits</TabsTrigger>
          <TabsTrigger value="workers">Regular carers</TabsTrigger>
          <TabsTrigger value="templates">Visit templates</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="uc-card p-5">
              <h2 className="uc-label mb-3">Details</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">Date of birth</dt><dd>{c.dob ? fmtDate(c.dob) : "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Phone</dt><dd>{c.phone ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Funding</dt><dd>{(c.fundingSource ?? "").replace(/_/g, " ")}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Risk level</dt><dd><Chip value={c.riskLevel === "high" ? "urgent" : c.riskLevel === "medium" ? "high" : "low"} label={c.riskLevel} /></dd></div>
                <div><dt className="text-xs text-muted-foreground">Service started</dt><dd>{fmtDate(c.startDate)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Commissioned hours</dt><dd>{d.packages[0]?.commissionedHoursPerWeek ?? "—"} / week</dd></div>
              </dl>
              {c.accessNotes && (
                <p className="mt-3 rounded-lg bg-[--brand-50] border p-2.5 text-xs" style={{ borderColor: "var(--line)" }}>
                  <strong>Access:</strong> {c.accessNotes}
                </p>
              )}
            </section>
            <section className="uc-card p-5">
              <h2 className="uc-label mb-3">Requirements & preferences</h2>
              <p className="text-xs text-muted-foreground mb-1">Required skills</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {d.requiredSkills.length === 0 ? <span className="text-sm text-muted-foreground">None specified</span> :
                  d.requiredSkills.map((sk) => (
                    <span key={sk} className="rounded bg-[--brand-100] px-2 py-0.5 text-xs font-medium text-[--brand-900]">{sk.replace(/_/g, " ")}</span>
                  ))}
              </div>
              <p className="text-xs text-muted-foreground mb-1">Preferred carer gender</p>
              <p className="text-sm mb-3">{d.preferences?.preferredGender === "any" || !d.preferences ? "No preference" : d.preferences.preferredGender}</p>
              {d.preferences?.otherNotes && <p className="text-xs text-muted-foreground">{d.preferences.otherNotes}</p>}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="visits" className="mt-4">
          <div className="uc-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Assigned to</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.visits.map((v) => (
                  <tr key={v.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(v.scheduledStart)} {fmtTime(v.scheduledStart)}–{fmtTime(v.scheduledEnd)}</td>
                    <td className="px-4 py-2.5 text-xs">{(v.visitType ?? "visit").replace(/_/g, " ")}{v.callType === "double" ? " (double-handed)" : ""}</td>
                    <td className="px-4 py-2.5 text-xs">{v.assignments.map((a) => a.name).filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-4 py-2.5"><Chip value={v.status} /></td>
                  </tr>
                ))}
                {d.visits.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No visits on record.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="workers" className="mt-4">
          <div className="uc-card p-5">
            {d.workers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No regular carers assigned yet — assignments build up as visits are allocated.</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
                {d.workers.map((w) => (
                  <li key={w.id} className="flex items-center gap-2.5 py-2.5">
                    <AvatarDot name={w.name ?? "?"} />
                    <span className="text-sm font-medium">{w.name}</span>
                    {w.isPrimary && <Chip value="verified" label="primary carer" />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="templates" className="mt-4 space-y-4">
          <VisitPatternForm clientId={Number(c.id)} onSaved={() => q.refetch()} />
          <div className="uc-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
                  <th className="px-4 py-2.5 font-medium">Days</th>
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Duration</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Double-handed</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {d.templates.map((t) => (
                  <tr key={t.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                    <td className="px-4 py-2.5 text-xs">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][t.dayOfWeek] ?? t.dayOfWeek}</td>
                    <td className="px-4 py-2.5 text-xs">{t.startTime}</td>
                    <td className="px-4 py-2.5 text-xs">{t.durationMinutes} min</td>
                    <td className="px-4 py-2.5 text-xs">{t.visitType.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2.5 text-xs">{t.callType === "double" ? "Yes" : "No"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Remove visit"
                        disabled={remove.isPending} onClick={() => remove.mutate({ id: Number(t.id) })}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {d.templates.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No regular visits yet. Add them above — the weekly rota is built from them.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
