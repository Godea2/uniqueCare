/**
 * Error types for AI calls. `classifyAiError` turns whatever the AI SDK throws into one of these,
 * so callers can branch without reading HTTP status codes.
 */

/** Quota used up or the feature is not enabled on the key. Do not retry. */
export class AiUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailable";
  }
}

/** The provider refused the content. */
export class ContentRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentRejected";
  }
}

/** Missing or invalid API key or model. Fix the server configuration. */
export class AiMisconfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiMisconfigured";
  }
}

/** The request itself was invalid. */
export class AiInvalidRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiInvalidRequest";
  }
}

/** Rate limit, timeout or provider outage. Safe to try again later. */
export class AiTransient extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiTransient";
  }
}

interface ErrorBody {
  error?: { type?: string; status?: string; message?: string; code?: string | number };
  message?: string;
}

export function mapAiError(status: number, body: ErrorBody | undefined, raw: string): Error {
  const detail = body?.error?.message ?? body?.message ?? raw.slice(0, 300);
  const kind = `${body?.error?.type ?? ""} ${body?.error?.status ?? ""}`.toLowerCase();
  if (kind.includes("safety") || kind.includes("content") || kind.includes("moderation")) {
    return new ContentRejected(detail || "The AI provider refused this content.");
  }
  switch (status) {
    case 401:
      return new AiMisconfigured("The AI API key is missing or invalid. Check GEMINI_API_KEY on the server.");
    case 403:
      return new AiMisconfigured(detail || "The AI API key is not allowed to use this model. Check the key and GEMINI_MODEL.");
    case 404:
      return new AiMisconfigured(detail || "The AI model was not found. Check GEMINI_MODEL.");
    case 402:
      return new AiUnavailable("The AI account has no remaining credit.");
    case 429:
      return /quota|billing|exceeded your current/i.test(detail)
        ? new AiUnavailable(detail || "The AI quota is used up.")
        : new AiTransient("The AI service is busy. Please try again in a minute.");
    case 400:
      return /api key/i.test(detail)
        ? new AiMisconfigured(detail)
        : new AiInvalidRequest(detail || "The AI request was not accepted.");
    case 408:
    case 424:
      return new AiTransient(detail || "The AI service timed out. Please try again.");
    default:
      if (status >= 500) return new AiTransient("The AI service is temporarily unavailable. Please try again shortly.");
      return new AiInvalidRequest(detail || `The AI request failed (HTTP ${status}).`);
  }
}

/** Classify an error thrown by the AI SDK. Never retries by itself. */
export function classifyAiError(err: unknown): Error {
  if (
    err instanceof AiUnavailable || err instanceof ContentRejected || err instanceof AiMisconfigured ||
    err instanceof AiInvalidRequest || err instanceof AiTransient
  ) {
    return err;
  }
  const anyErr = err as {
    status?: number; statusCode?: number; response?: { status?: number; body?: unknown };
    data?: unknown; error?: unknown; message?: string; responseBody?: unknown;
  };
  const status = anyErr?.status ?? anyErr?.statusCode ?? anyErr?.response?.status;
  const rawBody = anyErr?.response?.body ?? anyErr?.data ?? anyErr?.error ?? anyErr?.responseBody;
  let body: ErrorBody | undefined;
  if (rawBody && typeof rawBody === "object") body = rawBody as ErrorBody;
  else if (typeof rawBody === "string") {
    try { body = JSON.parse(rawBody) as ErrorBody; } catch { body = undefined; }
  }
  if (typeof status === "number") {
    return mapAiError(status, body, typeof rawBody === "string" ? rawBody : anyErr?.message ?? "");
  }
  return new AiTransient(anyErr?.message || "The AI call failed. Please try again.");
}

export function isRetryableAiError(err: unknown): boolean {
  return err instanceof AiTransient;
}
