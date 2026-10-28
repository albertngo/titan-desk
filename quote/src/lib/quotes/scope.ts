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
