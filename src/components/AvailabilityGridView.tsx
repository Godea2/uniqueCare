import {
  AVAILABILITY_COLS,
  AVAILABILITY_ROWS,
} from "@contracts/form-schema";
import {
  DAY_LABELS,
  SLOT_LABELS,
  parseAvailabilityGrid,
  availabilityTickCount,
  formatAvailabilitySummary,
  type AvailabilityGridValue,
  type AvailabilitySlot,
} from "@contracts/availability";

const SLOT_TONE: Record<AvailabilitySlot, string> = {
  mornings: "bg-amber-100 text-amber-900 border-amber-200",
  afternoons: "bg-sky-100 text-sky-900 border-sky-200",
  evenings: "bg-indigo-100 text-indigo-900 border-indigo-200",
  nights: "bg-slate-800 text-slate-50 border-slate-700",
};

/** Read-only visual of an applicant availability_grid answer. */
export function AvailabilityGridView({
  value,
  className = "",
  compact = false,
}: {
  value: unknown;
  className?: string;
  compact?: boolean;
}) {
  const grid = parseAvailabilityGrid(value);
  if (!grid) {
    return <span className="text-sm text-muted-foreground">Not answered</span>;
  }
  const ticks = availabilityTickCount(grid);

  return (
    <div className={`min-w-0 ${className}`}>
      {!compact && (
        <p className="mb-2 text-xs text-muted-foreground">
          {ticks} slot{ticks === 1 ? "" : "s"} selected
          <span className="sr-only"> — {formatAvailabilitySummary(grid)}</span>
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: "var(--line)" }}>
        <table className="w-full min-w-[320px] border-collapse text-xs">
          <thead>
            <tr className="border-b bg-slate-50/80" style={{ borderColor: "var(--line)" }}>
              <th className="w-12 px-2 py-2 text-left font-medium text-muted-foreground" scope="col">
                Day
              </th>
              {AVAILABILITY_COLS.map((c) => (
                <th key={c} scope="col" className="px-1 py-2 text-center font-medium text-muted-foreground">
                  {compact ? SLOT_LABELS[c].slice(0, 3) : SLOT_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AVAILABILITY_ROWS.map((d) => {
              const slots = new Set(grid[d] ?? []);
              const empty = slots.size === 0;
              return (
                <tr key={d} className={`border-b last:border-0 ${empty ? "opacity-40" : ""}`} style={{ borderColor: "var(--line)" }}>
                  <th scope="row" className="px-2 py-1.5 text-left font-medium text-slate-700">
                    {DAY_LABELS[d]}
                  </th>
                  {AVAILABILITY_COLS.map((c) => {
                    const on = slots.has(c);
                    return (
                      <td key={c} className="px-1 py-1.5 text-center">
                        <span
                          className={`inline-flex h-7 w-full max-w-[4.5rem] items-center justify-center rounded-md border text-[10px] font-semibold tracking-wide ${
                            on ? SLOT_TONE[c] : "border-transparent bg-slate-50 text-slate-300"
                          }`}
                          aria-label={`${DAY_LABELS[d]} ${SLOT_LABELS[c]}: ${on ? "available" : "not available"}`}
                        >
                          {on ? "✓" : "·"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!compact && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-hidden>
          {(Object.keys(SLOT_LABELS) as AvailabilitySlot[]).map((s) => (
            <li key={s} className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${SLOT_TONE[s]}`}>
              {SLOT_LABELS[s]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Read-only weekly windows from staff_availability (rota truth). */
export function StaffAvailabilityWindowsView({
  windows,
}: {
  windows: { dayOfWeek: number; startTime: string; endTime: string }[];
}) {
  if (!windows.length) {
    return <p className="text-sm text-muted-foreground">No weekly availability windows set.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {DOW_LABELS.map((label, dow) => {
        const wins = windows
          .filter((w) => Number(w.dayOfWeek) === dow)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        if (!wins.length) return null;
        return (
          <li key={dow} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="w-10 shrink-0 text-muted-foreground">{label}</span>
            <span className="flex flex-wrap justify-end gap-1.5">
              {wins.map((w, i) => (
                <span
                  key={i}
                  className="rounded-md border bg-[--brand-50] px-2 py-0.5 text-xs font-medium text-[--brand-900]"
                  style={{ borderColor: "var(--line)" }}
                >
                  {w.startTime.slice(0, 5)}–{w.endTime.slice(0, 5)}
                </span>
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Type guard helper for callers that still hold a raw answer object. */
export function asAvailabilityGrid(value: unknown): AvailabilityGridValue | null {
  return parseAvailabilityGrid(value);
}
