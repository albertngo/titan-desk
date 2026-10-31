import "server-only";
import { requireQuoter } from "@/lib/auth";
import type { EditorLine } from "@/lib/editor/model";
import { parseWork, workIsEmpty, type QuickChoice, type QuickProfile } from "@/lib/quick/plan";
import { getQuickForm, getStairProfiles } from "./load";
import { buildQuickOptions } from "./start";

/**
 * The quick form outside New quote (Albert, 2026-10-31): "+ From quick form" beside an editor's
 * option tabs builds one more option with the preliminary's screen. Both exports check the
 * caller is a quoter.
 */

/** The quick form's choices and staircase profiles as the browser may see them: charge rates only, no cost, no contractor. */
export async function quickFormForBrowser(): Promise<{ choices: QuickChoice[]; profiles: QuickProfile[] }> {
  await requireQuoter();
  const [quick, profileRows] = await Promise.all([getQuickForm().catch(() => []), getStairProfiles().catch(() => [])]);
  return {
    choices: quick.map((c) => ({
      ...c,
      parts: c.parts.map((p) => ({ ...p, cost: null, contractor: null })),
      product: c.product ? { ...c.product, cost: null } : null,
    })),
    // The preset price only; cost and the builder's template stay on the server.
    profiles: profileRows.map(({ id, name, type, method, steps, price }) => ({ id, name, type, method, steps, price, cost: null })),
  };
}

export type QuickOptionResult =
  | { ok: true; option: { name: string; description: string; lines: EditorLine[] }; skipped: string[] }
  | { ok: false; message: string };

/**
 * One option priced from the quick form, server-side like a new preliminary, for the editor to add.
 * Nothing is written: the option joins the editor's unsaved changes and is saved with them.
 * `taken`: the quote's option names already in use, so the new one reads differently.
 */
export async function quickOption(raw: unknown, taken: unknown): Promise<QuickOptionResult> {
  await requireQuoter();
  const work = parseWork(raw);
  if (workIsEmpty(work)) return { ok: false, message: "Pick some work first." };
  try {
    const [built] = await buildQuickOptions([work]);
    if (built.lines.length === 0) return { ok: false, message: built.skipped.length ? `Nothing could be priced: ${built.skipped.join("; ")}.` : "Nothing could be priced." };
    const used = new Set((Array.isArray(taken) ? taken : []).filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase()));
    let name = built.name;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${built.name} (${n})`;
    return { ok: true, option: { name, description: built.description, lines: built.lines }, skipped: built.skipped };
  } catch (e) {
    console.error("quickOption", e);
    return { ok: false, message: "The quick form couldn't be priced. Try again in a moment." };
  }
}
