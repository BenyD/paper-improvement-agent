import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import * as zod from "zod";

/**
 * The one LLM entry point. Every model call in the app goes through
 * `structured()`, which forces the answer through a typed tool schema and
 * validates it with zod — no freeform JSON parsing, no prompt that can drift
 * into unvalidated output.
 */

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function modelId(): string {
  // `||` not `??`: an empty ANTHROPIC_MODEL= line in .env.local must not
  // produce model: "".
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
}

let singleton: Anthropic | null = null;
function client(): Anthropic {
  if (!singleton) singleton = new Anthropic();
  return singleton;
}

export async function structured<S extends z.ZodType>(opts: {
  system: string;
  user: string;
  toolName: string;
  description: string;
  schema: S;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const attempt = async (feedback?: string): Promise<unknown> => {
    const res = await client().messages.create({
      model: modelId(),
      max_tokens: opts.maxTokens ?? 3000,
      // NOTE: `temperature` is deprecated on Claude 5 models (API 400s on
      // it), so judge determinism cannot come from temperature pinning.
      // Verdict stability is provided instead by forced tool schemas and the
      // adversarial verification pass on high-severity verdicts.
      system: opts.system,
      messages: [
        {
          role: "user",
          content: feedback ? `${opts.user}\n\n${feedback}` : opts.user,
        },
      ],
      tools: [
        {
          name: opts.toolName,
          description: opts.description,
          input_schema: zod.toJSONSchema(
            opts.schema,
          ) as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: opts.toolName },
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (block?.type !== "tool_use") {
      throw new Error("Model returned no structured output.");
    }
    return block.input;
  };

  // One corrective retry: schema violations (e.g. an out-of-enum value) get
  // the validation error fed back instead of failing the whole work unit.
  const first = opts.schema.safeParse(await attempt());
  if (first.success) return first.data;
  return opts.schema.parse(
    await attempt(
      `IMPORTANT: your previous ${opts.toolName} call failed validation:\n${first.error.message}\nCall the tool again with corrected input that satisfies the schema exactly.`,
    ),
  );
}
