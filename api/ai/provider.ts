import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject, generateText, type ModelMessage } from "ai";
import { z, type ZodType } from "zod";
import { AiMisconfigured, classifyAiError } from "./ai-client";
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

function modelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function languageModel() {
  return createGoogleGenerativeAI({ apiKey: apiKey() })(modelName());
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

/**
 * One typed, logged AI call. Screening and the other AI features use Gemini.
 * Every call is written to ai_runs.
 */
export async function callAI<T>(opts: {
  feature: string;
  promptVersion: string;
  schema: ZodType<T>;
  system: string;
  user: string;
  files?: AiFile[];
  temperature?: number;
  /** Semantic check on the parsed object (e.g. "sections must be non-empty"). */
  validate?: (obj: T) => boolean;
}): Promise<T> {
  const started = Date.now();
  const model = modelName();
  const files = opts.files ?? [];

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
    const messages = files.length > 0 ? userContent(opts.user, files) : undefined;

    try {
      const request = {
        model: languageModel(),
        schema: opts.schema,
        system: opts.system,
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
        ? await generateText({ model: languageModel(), system, messages })
        : await generateText({ model: languageModel(), system, prompt: opts.user });
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
