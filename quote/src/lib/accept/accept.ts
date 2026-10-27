import "server-only";
import { timingSafeEqual } from "node:crypto";
import { acceptProblems, buildAcceptance, readAcceptInput, type Acceptance } from "./plan";
import { acceptGate, recordAcceptance, stateOf, targetByToken } from "./record";

/**
 * The customer's Accept button (Albert, 2026-10-27), reached through /api/accept on the staff app
 * and never by a browser: the customer deployment holds no write token, only QUOTE_ACCEPT_KEY for
 * this one endpoint, and its server sends the customer's choices here. Every export checks the key
 * first, like the booking step. The version is found by the link's own secret and its frozen copy;
 * nothing the request says about prices or totals is ever used.
 */

/** Constant-time check of the key the customer deployment sends. No key configured means acceptance is off. */
export function acceptKeyOk(given: string | null): boolean {
  const want = process.env.QUOTE_ACCEPT_KEY;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type AcceptByLinkResult = { ok: true; acceptance: Acceptance } | { ok: false; status: number; message: string; problems?: string[] };

/** POST {token, store, userAgent, input}: record the customer's yes on the version that link points at. */
export async function acceptByLink(key: string | null, raw: unknown): Promise<AcceptByLinkResult> {
  if (!acceptKeyOk(key)) return { ok: false, status: 401, message: "Wrong or missing key." };
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const input = readAcceptInput(r.input);
  if (typeof r.token !== "string" || !input) return { ok: false, status: 400, message: "That request didn't make sense." };
  const { off, terms } = await acceptGate();
  if (off || !terms) return { ok: false, status: 503, message: "Online acceptance isn't switched on yet. Reply to the message this link came in, or call us." };
  const target = await targetByToken(r.token);
  if (!target?.copy) return { ok: false, status: 404, message: "This quote can't be found." };
  const method = r.store === true ? "store" : "link";
  const problems = acceptProblems(target.copy, stateOf(target), input, { terms, method });
  if (problems.length) return { ok: false, status: 422, message: problems[0], problems };
  const a = buildAcceptance(target.copy, input, { now: new Date(), terms, method, recordedBy: null, userAgent: typeof r.userAgent === "string" ? r.userAgent : null });
  const done = await recordAcceptance(target, a, method === "store" ? "customer (in store)" : "customer (their link)");
  return done.ok ? { ok: true, acceptance: done.acceptance } : done;
}
