/**
 * Minimal PostGREST helpers for the website's own `website_` tables.
 * Reads and public inserts use the anon key (RLS: anon INSERT only,
 * approved reviews SELECT only). Moderation uses the service role key,
 * server-side only, never shipped to the browser.
 */

const anonBase = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL ?? "";
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_ANON_KEY ?? "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function supabaseConfigured(): boolean {
  return Boolean(anonBase() && anonKey());
}

function restAnon(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  return fetch(`${anonBase()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey(),
      Authorization: `Bearer ${anonKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function restService(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  return fetch(`${anonBase()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

export type WebsiteReview = {
  id: string;
  created_at: string;
  name: string;
  relationship: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  approved_at: string | null;
};

export async function getApprovedReviews(revalidate = 300): Promise<WebsiteReview[]> {
  if (!supabaseConfigured()) return [];
  try {
    const res = await fetch(
      `${anonBase()}/rest/v1/website_reviews?status=eq.approved&select=id,created_at,name,relationship,rating,title,body,status,approved_at&order=created_at.desc`,
      {
        headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
        next: { revalidate },
      }
    );
    if (!res.ok) return [];
    return (await res.json()) as WebsiteReview[];
  } catch (e) {
    console.warn("[supabase] getApprovedReviews failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function insertEnquiry(row: Record<string, unknown>): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  try {
    const res = await restAnon("website_enquiries", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
    return res.ok;
  } catch (e) {
    console.warn("[supabase] insertEnquiry failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Public newsletter signup (anon INSERT only). Returns "exists" on a duplicate email. */
export async function insertSubscriber(email: string): Promise<"created" | "exists" | "error"> {
  if (!supabaseConfigured()) return "error";
  try {
    const res = await restAnon("website_subscribers", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ email, status: "active" }),
    });
    if (res.ok) return "created";
    if (res.status === 409) return "exists";
    return "error";
  } catch (e) {
    console.warn("[supabase] insertSubscriber failed:", e instanceof Error ? e.message : e);
    return "error";
  }
}

/** Public job application from the website form (anon INSERT only). */
export async function insertApplication(row: Record<string, unknown>): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  try {
    const res = await restAnon("website_applications", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ...row, status: "new" }),
    });
    return res.ok;
  } catch (e) {
    console.warn("[supabase] insertApplication failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function insertReview(row: Record<string, unknown>): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  try {
    // Generate the id here: the anon role may INSERT pending reviews but may
    // not SELECT them back, so return=representation is not possible.
    const id = crypto.randomUUID();
    const res = await restAnon("website_reviews", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ id, ...row }),
    });
    return res.ok ? id : null;
  } catch (e) {
    console.warn("[supabase] insertReview failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Server-only moderation (approve/reject) behind the signed-token endpoint. */
export async function moderateReview(id: string, action: "approve" | "reject"): Promise<boolean> {
  try {
    if (serviceKey()) {
      const status = action === "approve" ? "approved" : "rejected";
      const res = await restService(`website_reviews?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(
          action === "approve" ? { status, approved_at: new Date().toISOString() } : { status }
        ),
      });
      return res.ok;
    }
    // Without a service role key, use the secret-gated RPC instead.
    const secret = process.env.REVIEW_MODERATION_SECRET;
    if (!secret || !supabaseConfigured()) return false;
    const res = await restAnon("rpc/website_moderate_review", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_action: action, p_secret: secret }),
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch (e) {
    console.warn("[supabase] moderateReview failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
