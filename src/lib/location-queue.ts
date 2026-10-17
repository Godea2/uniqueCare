/**
 * Offline / poor-signal queue for visit location probes.
 *
 * Policy:
 * - Clock-in and clock-out require a live network + GPS (server must verify the geofence).
 * - Probes may be queued offline and flushed when connectivity returns.
 * - Server sweep still auto clock-outs if the app never comes back online.
 */

const STORAGE_KEY = "uc.probeQueue.v1";
const MAX_QUEUE = 40;

export type QueuedProbe = {
  visitId: number;
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: string;
};

function readQueue(): QueuedProbe[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedProbe[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedProbe[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
  } catch {
    /* quota / private mode */
  }
}

export function enqueueProbe(item: Omit<QueuedProbe, "capturedAt"> & { capturedAt?: string }) {
  const q = readQueue();
  q.push({
    ...item,
    capturedAt: item.capturedAt ?? new Date().toISOString(),
  });
  writeQueue(q);
}

export function peekProbeQueue(): QueuedProbe[] {
  return readQueue();
}

export function clearProbeQueue() {
  writeQueue([]);
}

export function replaceProbeQueue(items: QueuedProbe[]) {
  writeQueue(items);
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
