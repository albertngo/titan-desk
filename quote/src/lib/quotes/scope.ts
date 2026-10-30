import { quoteKind } from "@/lib/send/summary";
import type { Part, Scope } from "./types";

/**
 * Scopes (Albert, 2026-10-28: "For stair quotes, generally I like to keep them separate from the
 * flooring quote. Basically, just create it as an option."). Every option is Flooring or Stairs, and
 * a customer accepts at most one option of each, on the same quote. Pure; tested in tests/scope.test.ts.
 *
 * Nobody has to choose: an option left blank is Stairs when every priced line on it is a stair line,
 * and Flooring otherwise. The editor's Scope picker sets it outright when that guess is wrong.
 */

/** Quote Options → Scope as stored: anything but the two names reads as blank. */
export const scopeValue = (v: unknown): Scope | null => (v === "Flooring" || v === "Stairs" ? v : null);

/**
 * Parts (Albert, 2026-10-30, vault 05_decisions/2026-10-30-quote-one-working-quote): the part of the home an
 * option covers. Options in one Part are alternatives, and a customer takes at most one option per Part; what
 * an option covers in detail goes in its description. An option with no Part counts its scope as its Part,
 * so a quote made before Parts still takes one flooring and one stairs option.
 */
export const PARTS: { part: Part; scope: Scope }[] = [
  { part: "Main floor", scope: "Flooring" },
  { part: "Upstairs", scope: "Flooring" },
  { part: "Basement", scope: "Flooring" },
  { part: "Main stairs", scope: "Stairs" },
  { part: "Basement stairs", scope: "Stairs" },
];

/** Quote Options → Part as stored: anything off the list reads as blank. */
export const partValue = (v: unknown): Part | null => PARTS.find((p) => p.part === v)?.part ?? null;

/** What an option is an alternative within: its Part, else its scope. */
export const partKey = (o: { part?: Part | null } & Parameters<typeof optionScope>[0]): string => o.part ?? optionScope(o);

/** The scope an option counts as: what was set, else its Part's, else what its lines say. */
export function optionScope(o: Parameters<typeof quoteKind>[0] & { scope?: Scope | null; part?: Part | null }): Scope {
  return o.scope ?? PARTS.find((p) => p.part === o.part)?.scope ?? (quoteKind(o) === "stairs" ? "Stairs" : "Flooring");
}

/**
 * The option tabs split by scope (Albert, 2026-10-30: "a separation from Stairs and Flooring. Flooring | Stair"):
 * flooring first, then stairs, each keeping its order. `split` is false when every option is one scope, and then
 * the tabs show no headings.
 */
export function scopeGroups<O extends Parameters<typeof optionScope>[0]>(options: O[]): { split: boolean; groups: { scope: Scope; options: O[] }[] } {
  const groups = (["Flooring", "Stairs"] as Scope[]).map((scope) => ({ scope, options: options.filter((o) => optionScope(o) === scope) })).filter((g) => g.options.length > 0);
  return { split: groups.length > 1, groups };
}
