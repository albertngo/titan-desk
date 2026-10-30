import { quoteKind } from "@/lib/send/summary";
import type { Scope } from "./types";

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

/** The scope an option counts as: what was set, else what its lines say. */
export function optionScope(o: Parameters<typeof quoteKind>[0] & { scope?: Scope | null }): Scope {
  return o.scope ?? (quoteKind(o) === "stairs" ? "Stairs" : "Flooring");
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
