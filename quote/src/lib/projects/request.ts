import type { PlanProgress, StageProgress } from "@/lib/calc";

/**
 * Payment requests from All quotes (Albert, 2026-11-27; vault 05_decisions/2026-11-27-quote-payment-request-buttons-and-
 * auto-second and -payment-requests-test-switch-and-field). Pure, no I/O: src/lib/quotes/paymentRequest.ts sends and
 * records; this decides the amount, the stage it is for, and keeps the log on Quotes → Payment Requests. Tested in
 * tests/paymentRequest.test.ts.
 *
 * - **Second:** what is still owing of every stage but the final one (the payments due by the first day on site).
 * - **Final:** the balance on the contract.
 * - The amount is always worked out on the server from the contract and the payments read that moment; nothing a browser
 *   sends about money is used.
 * - While Settings' "Payment requests go to customers" is off, a request goes to the sender's own GHL contact, marked
 *   Test, and is logged as a test: it never counts as asking the customer.
 */

export type RequestKind = "second" | "final";

export const REQUEST_WORDS: Record<RequestKind, { button: string; title: string; noun: string }> = {
  second: { button: "Request 2nd payment", title: "Request second payment", noun: "second payment" },
  final: { button: "Request final payment", title: "Request final payment", noun: "final payment" },
};

/** One request, as Quotes → Payment Requests keeps it (a JSON list, newest last). */
export type PaymentRequest = {
  /** ISO time it went. */
  at: string;
  /** Who pressed the button (sign-in email), and who it went out as: "office" (the default, 2026-11-27) or a staff email; null = themselves. */
  by: string;
  as: string | null;
  /** Who was cc'd: the project's PM (2026-11-27). */
  cc?: string | null;
  kind: RequestKind;
  amount: number;
  email: boolean;
  text: boolean;
  /** Sent to the sender's own contact while the switch was off: never counts as asking the customer. */
  test: boolean;
};

const KINDS: readonly RequestKind[] = ["second", "final"];
/** The log keeps the newest this many; older ones are in the version history. */
export const KEEP = 40;

/** The log as stored; anything that doesn't read cleanly is left out, never guessed. */
export function parseRequests(raw: string | null | undefined): PaymentRequest[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.flatMap((r): PaymentRequest[] => {
      const x = r as Partial<PaymentRequest>;
      if (typeof x.at !== "string" || typeof x.by !== "string" || !KINDS.includes(x.kind as RequestKind) || typeof x.amount !== "number" || !Number.isFinite(x.amount)) return [];
      return [{ at: x.at, by: x.by, as: typeof x.as === "string" ? x.as : null, ...(typeof x.cc === "string" ? { cc: x.cc } : {}), kind: x.kind as RequestKind, amount: x.amount, email: x.email === true, text: x.text === true, test: x.test === true }];
    });
  } catch {
    return [];
  }
}

/** The log with one more request at the end, the oldest dropped past KEEP. */
export function addRequest(raw: string | null | undefined, r: PaymentRequest): string {
  return JSON.stringify([...parseRequests(raw), r].slice(-KEEP));
}

/** The latest request of this kind that went to the customer (tests never count). */
export function lastAsked(list: PaymentRequest[], kind: RequestKind): PaymentRequest | null {
  return [...list].reverse().find((r) => r.kind === kind && !r.test) ?? null;
}

/** What to ask for: the second payments still owing, or the balance. */
export const requestAmount = (kind: RequestKind, plan: PlanProgress) => (kind === "second" ? plan.secondOwing : plan.balance);

/**
 * The stage the request is for, so the message can say how it is paid: the final stage for the final payment; for the
 * second, the first stage before the final that isn't paid yet. Null when the plan has no stages (won outside the app).
 */
export function stageFor(kind: RequestKind, plan: PlanProgress): StageProgress | null {
  if (plan.stages.length === 0) return null;
  if (kind === "final") return plan.stages[plan.stages.length - 1];
  return plan.stages.slice(0, -1).find((s) => s.state !== "paid") ?? null;
}

/** Why this request can't go, in plain words; null when it can. */
export function requestProblem(kind: RequestKind, plan: PlanProgress | null, channels: { email: boolean; text: boolean }): string | null {
  if (!plan) return "The payments couldn't be read from Notion, so the amount isn't known.";
  if (!channels.email && !channels.text) return "Pick email, text or both.";
  // A second payment is a plan of three installments or more (2026-11-27); two installments are a deposit and a final.
  if (kind === "second" && plan.stages.length < 3) return "This contract's payment plan has no second payment.";
  if (requestAmount(kind, plan) <= 0) return kind === "second" ? "The second payment is already in." : "Nothing is left to collect.";
  return null;
}

/** The version history line: "Final payment of $450.00 requested by email and text", "(test, to themselves)". */
export function requestLogWhat(r: Pick<PaymentRequest, "kind" | "amount" | "email" | "text" | "test" | "as" | "cc">, money: (n: number) => string): string {
  const how = [r.email ? "email" : null, r.text ? "text" : null].filter(Boolean).join(" and ");
  const what = `${r.kind === "second" ? "Second" : "Final"} payment of ${money(r.amount)} requested by ${how}`;
  const as = r.as === "office" ? ", as the office" : r.as ? `, as ${r.as}` : "";
  return `${what}${as}${r.cc ? `, cc ${r.cc}` : ""}${r.test ? " (test: sent to themselves, not the customer)" : ""}`;
}

/** The sender a request starts on (Albert, 2026-11-27: "default is office, cc'd the PM. But able to select who to send it out as"). */
export const OFFICE = "office";
