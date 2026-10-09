import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject, generateText } from "ai";
import { z, type ZodType } from "zod";
import { listModels, classifyAiError } from "./ai-client";
import { db } from "../db";

export const kimiGw = createOpenAICompatible({
  name: "kimi-gw",
  baseURL: process.env.KIMI_AGENTGW_BASE_URL!,
  apiKey: process.env.KIMI_AGENTGW_API_KEY!,
  includeUsage: true,
  supportsStructuredOutputs: true,
});

let cachedModel: string | null = null;
async function modelId(): Promise<string> {
  if (cachedModel) return cachedModel;
  const { defaultModelId } = await listModels();
  cachedModel = defaultModelId;
  return defaultModelId;
}

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
  // If there is leading/trailing prose, grab the outermost JSON object/array.
  const start = cleaned.search(/[{[]/);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice);
}

/**
 * One typed, logged AI call. Strict JSON via zod, temperature 0.2 for
 * scoring/structuring and 0.4 for prose. Every call is written to ai_runs.
 *
 * Fallbacks:
 *  1. Some gateway models only accept temperature=1 — retry without it.
 *  2. If structured output (`response_format`) returns a schema mismatch or an
 *     empty/invalid object (gateway models can struggle with nested arrays of
 *     objects), fall back to plain-text generation + local zod validation.
 */
export async function callAI<T>(opts: {
  feature: string;
  promptVersion: string;
  schema: ZodType<T>;
  system: string;
  user: string;
  temperature?: number;
  /** Semantic check on the parsed object (e.g. "sections must be non-empty"). */
  validate?: (obj: T) => boolean;
}): Promise<T> {
  const started = Date.now();
  const model = await modelId();

  const logRun = async (status: "ok" | "error", tokens: number, error?: string) => {
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
  };

  try {
    let obj: T | null = null;
    let tokens = 0;

    // ── Primary: structured output ──
    try {
      const request = {
        model: kimiGw(model),
        schema: opts.schema,
        system: opts.system,
        prompt: opts.user,
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
      // ── Fallback: plain-text JSON + local validation ──
      if (!isSchemaFailure(primaryErr)) throw primaryErr;
      const jsonSchema = JSON.stringify(z.toJSONSchema(opts.schema as never));
      const text = await generateText({
        model: kimiGw(model),
        system:
          opts.system +
          "\n\nReply with strict JSON only — no markdown fences, no commentary. " +
          "The JSON MUST match this JSON Schema exactly, with every array element fully populated:\n" +
          jsonSchema,
        prompt: opts.user,
      });
      tokens = (text.usage?.inputTokens ?? 0) + (text.usage?.outputTokens ?? 0);
      obj = opts.schema.parse(parseJsonText(text.text));
      if (opts.validate && !opts.validate(obj)) {
        throw new StructuredOutputFailed("fallback output failed semantic validation");
      }
    }

    await logRun("ok", tokens);
    return obj;
  } catch (err) {
    const classified = classifyAiError(err);
    await logRun("error", 0, classified.message);
    throw classified;
  }
}
