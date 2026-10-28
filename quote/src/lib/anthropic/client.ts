import "server-only";
import { isCustomerDeployment } from "@/lib/mode";
import { keyProblem } from "./key";

/**
 * The ONLY file in quote/ that talks to Claude (Albert, 2026-10-28: reading photos of the stair site
 * sheet), and the only reader of QUOTE_ANTHROPIC_KEY, which is set on the staff deployment only.
 * One request: images plus instructions in, the input of one forced tool call out. Nothing is stored
 * here; the caller cleans the answer before anything uses it. Called only from src/lib/quotes/sitesheet.ts
 * (tests/boundary.test.ts).
 */

const API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-5-5";

export type ImageIn = { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export class ClaudeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ClaudeError";
  }
}

export const readerOn = (): boolean => !isCustomerDeployment() && !!process.env.QUOTE_ANTHROPIC_KEY?.trim();

export async function readWithTool(images: ImageIn[], prompt: string, tool: { name: string; description: string; schema: object }): Promise<unknown> {
  const key = process.env.QUOTE_ANTHROPIC_KEY?.trim();
  if (!key || isCustomerDeployment()) throw new ClaudeError("Reading site sheets isn't set up (QUOTE_ANTHROPIC_KEY).", 503);
  // Checked before it goes in a header (2026-10-28): a malformed value once made fetch throw with the value in its message.
  const problem = keyProblem(key);
  if (problem) throw new ClaudeError(`QUOTE_ANTHROPIC_KEY ${problem}`, 503);
  let res: Response;
  try {
    res = await fetch(API, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema }],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: [...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mediaType, data: i.base64 } })), { type: "text", text: prompt }],
        },
      ],
    }),
    signal: AbortSignal.timeout(110_000),
    cache: "no-store",
    });
  } catch (e) {
    // Never the thrown message: it can carry the request's headers.
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ClaudeError(timedOut ? "Claude took too long to read the photos. Try again." : "Claude couldn't be reached. Try again.", 502);
  }
  if (!res.ok) {
    // The API's own error words (they never repeat the key), not the raw body.
    const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } } | null;
    const why = typeof body?.error?.message === "string" ? body.error.message.slice(0, 160) : "no reason given";
    throw new ClaudeError(res.status === 401 ? "Claude refused the key (401). Check QUOTE_ANTHROPIC_KEY on this deployment." : `Claude ${res.status}: ${why}`, res.status);
  }
  const out = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[] };
  const call = out.content?.find((c) => c.type === "tool_use" && c.name === tool.name);
  if (!call) throw new ClaudeError("Claude didn't return the sheet's fields.", 502);
  return call.input;
}
