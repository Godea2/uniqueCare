const KEY = "uc-auth-session";

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: AuthSession | null) {
  if (!session) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("uc-auth-changed"));
}

let refreshInFlight: Promise<AuthSession | null> | null = null;

export async function refreshSession(): Promise<AuthSession | null> {
  const current = readSession();
  if (!current) return null;
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.session) {
          writeSession(null);
          return null;
        }
        writeSession(body.session as AuthSession);
        return body.session as AuthSession;
      })
      .catch(() => {
        writeSession(null);
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function authorizedFetch(input: RequestInfo | URL, init?: RequestInit) {
  let session = readSession();
  if (session && session.expiresAt * 1000 < Date.now() + 60_000) {
    session = await refreshSession();
  }
  const headers = new Headers(init?.headers);
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);
  const response = await fetch(input, { ...init, headers, credentials: "include" });
  if (response.status === 401 && session) {
    const next = await refreshSession();
    if (!next) return response;
    headers.set("Authorization", `Bearer ${next.accessToken}`);
    return fetch(input, { ...init, headers, credentials: "include" });
  }
  return response;
}

export async function postAuth<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Request failed");
  }
  return payload as T;
}
