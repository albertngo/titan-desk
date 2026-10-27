import "server-only";
import { requireQuoterPerson } from "@/lib/auth";
import { acceptProblems, buildAcceptance, readAcceptInput } from "./plan";
import { acceptGate, cancelAcceptanceRecord, handOff, recordAcceptance, stateOf, targetById, type CancelResult } from "./record";
import type { Terms } from "./terms";

/**
 * The staff side of acceptance (Albert, 2026-10-27), each export for a signed-in quoter only:
 * accepting on the customer's behalf (only with a reason saying where their written yes is),
 * retrying a hand-off that failed, and cancelling an acceptance. The writes are in record.ts.
 */

/** Why acceptance is off on this deployment (null when it is on), and the Project Expectations it is taken against, for the quote page. */
export type AcceptReadiness = { off: string | null; terms: Terms | null };

export async function acceptReadiness(): Promise<AcceptReadiness> {
  await requireQuoterPerson();
  const { off, terms } = await acceptGate();
  return { off, terms: terms ? { id: terms.id, on: terms.on } : null };
}

export type { CancelResult };

export type StaffAcceptResult = { ok: true; warning: string | null } | { ok: false; message: string; problems?: string[] };

/** Record a customer's yes for them: a signed paper, an email saying yes. Same checks as their own Accept, plus the reason. */
export async function acceptForCustomer(versionId: string, raw: unknown): Promise<StaffAcceptResult> {
  const person = await requireQuoterPerson();
  const { off, terms } = await acceptGate();
  if (off || !terms) return { ok: false, message: off ?? "Acceptance is off." };
  const target = await targetById(versionId);
  const input = readAcceptInput(raw);
  if (!target?.copy || !input) return { ok: false, message: "That request didn't make sense. Reload the page." };
  const problems = acceptProblems(target.copy, stateOf(target), input, { terms, method: "staff" });
  if (problems.length) return { ok: false, message: "Not recorded.", problems };
  const a = buildAcceptance(target.copy, input, { now: new Date(), terms, method: "staff", recordedBy: person.email, userAgent: null });
  const done = await recordAcceptance(target, a, person.email);
  if (!done.ok) return { ok: false, message: done.message };
  return { ok: true, warning: handoffWarning(done.handoff) };
}

/** Run the hand-off again: GHL Won, and whichever message didn't go. */
export async function retryHandoff(versionId: string): Promise<StaffAcceptResult> {
  await requireQuoterPerson();
  const target = await targetById(versionId);
  if (!target?.acceptance || target.acceptance.cancelled) return { ok: false, message: "This version has no acceptance to hand off." };
  return { ok: true, warning: handoffWarning(await handOff(versionId)) };
}

/** Cancel an acceptance: the customer backed out, or the deposit never came. The reason is required. */
export async function cancelAcceptance(versionId: string, reason: string): Promise<CancelResult> {
  const person = await requireQuoterPerson();
  const why = String(reason ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (why.length < 3) return { ok: false, message: "Say why the acceptance is cancelled." };
  return cancelAcceptanceRecord(versionId, why, person.email);
}

function handoffWarning(h: { ghl: string; ghlMessage: string | null; tellFailed: string | null }): string | null {
  const parts = [h.ghl === "done" ? null : `GHL wasn't moved to Project Won: ${h.ghlMessage ?? "the Make step is off"}.`, h.tellFailed];
  return parts.filter(Boolean).join(" ") || null;
}
