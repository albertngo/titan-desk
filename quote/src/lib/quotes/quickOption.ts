import "server-only";
import { requireQuoter } from "@/lib/auth";
import type { EditorLine } from "@/lib/editor/model";
import { floorPlan, sheetSkus } from "@/lib/floorsheet/plan";
import { cleanFloorSheet } from "@/lib/floorsheet/sheet";
import { browserProfiles, parseWork, workIsEmpty, type QuickChoice, type QuickProfile, type QuickWork } from "@/lib/quick/plan";
import { getQuickForm, getQuickProfiles, productsBySku } from "./load";
import { buildQuickOptions } from "./start";

/**
 * The quick form outside New quote (Albert, 2026-10-31): "+ From quick form" beside an editor's
 * option tabs builds one more option with the preliminary's screen. Both exports check the
 * caller is a quoter.
 */

/** The quick form's choices and staircase profiles as the browser may see them: charge rates only, no cost, no contractor. */
export async function quickFormForBrowser(): Promise<{ choices: QuickChoice[]; profiles: QuickProfile[] }> {
  await requireQuoter();
  const [quick, profiles] = await Promise.all([getQuickForm().catch(() => []), getQuickProfiles().catch(() => [])]);
  return {
    choices: quick.map((c) => ({
      ...c,
      // The glue's charge rate stays (it's in the row's rate); its cost doesn't (2026-11-06).
      parts: c.parts.map((p) => ({
        ...p,
        cost: null,
        contractor: null,
        material: p.material ? { ...p.material, default: { ...p.material.default, cost: null }, choices: p.material.choices.map((m) => ({ ...m, cost: null })) } : null,
      })),
      product: c.product ? { ...c.product, cost: null } : null,
    })),
    // Each staircase's preset Stair Item lines at charge rates; cost and the template stay on the server.
    profiles: browserProfiles(profiles),
  };
}

export type FloorOptionsResult =
  | { ok: true; options: { name: string; description: string; lines: EditorLine[] }[]; notes: string[] }
  | { ok: false; message: string };

/**
 * The Flooring Site Sheet's options (Albert, 2026-11-03: "into rooms and flooring lines"), priced server-side
 * exactly like a preliminary: floorPlan() turns the checked sheet into quick-form works, and buildQuickOptions()
 * prices them from Airtable. Nothing is written: the options join the editor's draft and are saved with it.
 * `taken`: the quote's option names already in use, so the new ones read differently.
 */
export async function floorOptions(rawSheet: unknown, taken: unknown): Promise<FloorOptionsResult> {
  await requireQuoter();
  const sheet = cleanFloorSheet(rawSheet);
  try {
    const [choices, skus] = await Promise.all([getQuickForm(), productsBySku(sheetSkus(sheet))]);
    const plan = floorPlan(sheet, choices, skus);
    if (plan.works.length === 0) return { ok: false, message: plan.notes.length ? `Nothing to build: ${plan.notes.join(" ")}` : "Nothing to build: the sheet has no rooms or floors." };
    const works: QuickWork[] = plan.works.map((w) => ({ rows: w.rows, stairs: [], extraCost: null, description: w.description, building: null }));
    const built = await buildQuickOptions(works);
    const used = new Set((Array.isArray(taken) ? taken : []).filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase()));
    const options = built.flatMap((b, i) => {
      if (b.lines.length === 0) return [];
      let name = b.name;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${b.name} (${n})`;
      used.add(name.toLowerCase());
      return [{ name, description: plan.works[i].description, lines: b.lines }];
    });
    const skipped = [...new Set(built.flatMap((b) => b.skipped))];
    const notes = [...plan.notes, ...(skipped.length ? [`Not priced: ${skipped.join("; ")}.`] : [])];
    if (options.length === 0) return { ok: false, message: `Nothing could be priced. ${notes.join(" ")}` };
    return { ok: true, options, notes };
  } catch (e) {
    console.error("floorOptions", e);
    return { ok: false, message: "The flooring options couldn't be priced. Try again in a moment." };
  }
}

export type QuickOptionResult =
  | { ok: true; options: { name: string; description: string; lines: EditorLine[]; scope?: "Stairs" }[]; skipped: string[] }
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
    // A tab with flooring and stairs comes back as two options (2026-11-06), the stairs one scoped Stairs.
    const built = (await buildQuickOptions([work])).filter((b) => b.lines.length > 0);
    const skipped = [...new Set(built.flatMap((b) => b.skipped))];
    if (built.length === 0) return { ok: false, message: skipped.length ? `Nothing could be priced: ${skipped.join("; ")}.` : "Nothing could be priced." };
    const used = new Set((Array.isArray(taken) ? taken : []).filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase()));
    const options = built.map((b) => {
      let name = b.name;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${b.name} (${n})`;
      used.add(name.toLowerCase());
      return { name, description: b.description, lines: b.lines, ...(b.scope ? { scope: b.scope } : {}) };
    });
    return { ok: true, options, skipped };
  } catch (e) {
    console.error("quickOption", e);
    return { ok: false, message: "The quick form couldn't be priced. Try again in a moment." };
  }
}
