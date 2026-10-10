import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject, generateText, type ModelMessage } from "ai";
import { z, type ZodType } from "zod";
import { AiMisconfigured, AiUnavailable, classifyAiError, isRetryableAiError } from "./ai-client";
import { db } from "../db";

const DEFAULT_MODEL = "gemini-3.8-flash";

export type AiFile = {
  data: Uint8Array;
  mediaType: string;
  filename?: string;
};

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    throw new AiMisconfigured(
      "GEMINI_API_KEY is not set. Add it on the server, then screen this application again.",
    );
  }
  return key;
}

export function modelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/** Tried in order when the main model is overloaded. Override with GEMINI_FALLBACK_MODELS (comma-separated). */
const DEFAULT_FALLBACKS = "gemini-flash-latest,gemini-flash-lite-latest";

function modelChain(): string[] {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? DEFAULT_FALLBACKS)
    .split(",").map((m) => m.trim()).filter(Boolean);
  return [...new Set([modelName(), ...fallbacks])];
}

/** Stay well inside the 60 s serverless limit, leaving time to save the result. */
const AI_TIME_BUDGET_MS = 45_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Internal marker: structured output failed schema/validation — try plain-text fallback. */
class StructuredOutputFailed extends Error {}

function isSchemaFailure(e: unknown): boolean {
  return (
    e instanceof StructuredOutputFailed ||
    (e instanceof Error && /no object generated|did not match schema/i.test(e.message))
  );
}

/** Strip markdown fences the model may wrap around JSON. */
function parseJsonText(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.search(/[{[]/);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice);
}

function userContent(text: string, files: AiFile[]): ModelMessage[] {
  return [{
    role: "user",
    content: [
      { type: "text", text },
      ...files.map((file) => ({
        type: "file" as const,
        data: file.data,
        mediaType: file.mediaType,
        filename: file.filename,
      })),
    ],
  }];
}

type CallOpts<T> = {
  feature: string;
  promptVersion: string;
  schema: ZodType<T>;
  system: string;
  user: string;
  files?: AiFile[];
  temperature?: number;
  /** Semantic check on the parsed object (e.g. "sections must be non-empty"). */
  validate?: (obj: T) => boolean;
};

/**
 * One typed, logged AI call. Screening and the other AI features use Gemini.
 * When a model is overloaded or rate-limited it is retried once, then the next model in
 * the fallback chain is used, all inside a fixed time budget. Every attempt is written to ai_runs.
 */
export async function callAI<T>(opts: CallOpts<T>): Promise<T> {
  const started = Date.now();
  const chain = modelChain();
  const plan = [chain[0], chain[0], ...chain.slice(1)];
  let lastError: Error | null = null;

  for (let i = 0; i < plan.length; i++) {
    const model = plan[i];
    if (i > 0 && Date.now() - started > AI_TIME_BUDGET_MS) break;
    if (i === 1) await sleep(3000);
    const attemptStarted = Date.now();
    try {
      const { obj, tokens } = await callModel(model, opts);
      await logRun(opts, model, attemptStarted, "ok", tokens);
      return obj;
    } catch (err) {
      const classified = classifyAiError(err);
      await logRun(opts, model, attemptStarted, "error", 0, classified.message);
      lastError = classified;
      if (isRetryableAiError(classified)) continue;
      // Quotas are per model, and a fallback name may not exist on this key: move to the next model.
      const tryNextModel = classified instanceof AiUnavailable
        || (classified instanceof AiMisconfigured && model !== chain[0] && !/api key/i.test(classified.message));
      if (!tryNextModel) throw classified;
      while (plan[i + 1] === model) i++;
    }
  }
  throw lastError ?? new Error("The AI call failed.");
}

async function logRun<T>(opts: CallOpts<T>, model: string, started: number, status: "ok" | "error", tokens: number, error?: string) {
  await db
    .from("aiRuns")
    .insert({
      feature: opts.feature,
      model,
      promptVersion: opts.promptVersion,
      latencyMs: Date.now() - started,
      tokens: Number.isFinite(tokens) ? tokens : 0,
      status,
      error,
    })
    .catch(() => {});
}

async function callModel<T>(modelId: string, opts: CallOpts<T>): Promise<{ obj: T; tokens: number }> {
  const languageModel = () => createGoogleGenerativeAI({ apiKey: apiKey() })(modelId);
  const files = opts.files ?? [];
  let obj: T | null = null;
  let tokens = 0;
  const messages = files.length > 0 ? userContent(opts.user, files) : undefined;

  try {
    const request = {
      model: languageModel(),
      schema: opts.schema,
      system: opts.system,
      maxRetries: 0,
      ...(messages ? { messages } : { prompt: opts.user }),
    };
    let result;
    try {
      result = await generateObject({ ...request, temperature: opts.temperature ?? 0.2 });
    } catch (e) {
      if (e instanceof Error && /temperature/i.test(e.message)) {
        result = await generateObject(request);
      } else {
        throw e;
      }
    }
    tokens = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
    obj = result.object as T;
    if (opts.validate && !opts.validate(obj)) {
      throw new StructuredOutputFailed("structured output failed semantic validation");
    }
  } catch (primaryErr) {
    if (!isSchemaFailure(primaryErr)) throw primaryErr;
    const jsonSchema = JSON.stringify(z.toJSONSchema(opts.schema as never));
    const system =
      opts.system +
      "\n\nReply with strict JSON only — no markdown fences, no commentary. " +
      "The JSON MUST match this JSON Schema exactly, with every array element fully populated:\n" +
      jsonSchema;
    const text = messages
      ? await generateText({ model: languageModel(), system, messages, maxRetries: 0 })
      : await generateText({ model: languageModel(), system, prompt: opts.user, maxRetries: 0 });
    tokens = (text.usage?.inputTokens ?? 0) + (text.usage?.outputTokens ?? 0);
    obj = opts.schema.parse(parseJsonText(text.text));
    if (opts.validate && !opts.validate(obj)) {
      throw new StructuredOutputFailed("fallback output failed semantic validation");
    }
  }

  return { obj: obj as T, tokens };
}
