/**
 * Is the reading key a key? (2026-10-28: the first try on the staff deployment failed because the
 * setting held a pasted curl command, and the raw fetch error printed part of the key on screen.)
 * Pure; tested in tests/anthropic.test.ts. The words never repeat any of the value: they say what is
 * wrong with it, never what it is. src/lib/anthropic/client.ts names the setting in front of them.
 */

const KEY = /^sk-ant-[A-Za-z0-9_-]{20,}$/;

/** Why the value can't be sent as the key, or null when it looks like an API key. */
export function keyProblem(value: string): string | null {
  const v = value.trim();
  if (/\s|curl|x-api-key|https?:/i.test(v)) return "holds more than the key (a pasted command?). Paste only the key itself, which starts sk-ant-api.";
  if (!KEY.test(v)) return "doesn't look like an Anthropic API key, which starts sk-ant-api. Make one in the Anthropic Console under API keys.";
  if (!v.startsWith("sk-ant-api")) return "isn't an API key: it starts sk-ant- but not sk-ant-api. Make one in the Anthropic Console under API keys.";
  return null;
}
