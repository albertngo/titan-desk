/**
 * Is the reading key a key? (2026-10-28: the first try on the staff deployment failed because the
 * setting held a pasted curl command, and the raw fetch error printed part of the key on screen.)
 * Pure; tested in tests/anthropic.test.ts. Any single sk-ant- token passes: the Console hands out user keys
 * (sk-ant-usr-) as well as workspace keys (sk-ant-api…), and Anthropic's own 401 judges whether one is real. The words never repeat any of the value: they say what is
 * wrong with it, never what it is. src/lib/anthropic/client.ts names the setting in front of them.
 */

const KEY = /^sk-ant-[A-Za-z0-9_-]{20,}$/;

/** Why the value can't be sent as the key, or null when it looks like an API key. */
export function keyProblem(value: string): string | null {
  const v = value.trim();
  if (/\s|curl|x-api-key|https?:/i.test(v)) return "holds more than the key (a pasted command?). Paste only the key itself, which starts sk-ant-.";
  if (!KEY.test(v)) return "doesn't look like an Anthropic API key, which starts sk-ant-. Copy it again from the Anthropic Console under API keys.";
  return null;
}

/**
 * The one JSON object in an answer's text: the whole text, or what sits inside a ```json fence, or from the
 * first "{" to the last "}". Undefined when none of those parses to an object.
 */
export function jsonFromText(text: string): unknown {
  const tries = [text.trim(), /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1]?.trim(), text.includes("{") ? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1) : undefined];
  for (const t of tries) {
    if (!t) continue;
    try {
      const v = JSON.parse(t);
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {
      // try the next way of finding it
    }
  }
  return undefined;
}
