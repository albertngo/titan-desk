/**
 * The front page's money and follow-up (Albert, 2026-11-07: "Build value, follow up filter and summary
 * strip"). Pure, no I/O. What a quote is worth and which sent quotes want a nudge are decided in
 * group.ts (the list sorts and filters on them); this words the Value column and adds up the strip.
 *
 * Money is in dollars, as Airtable's option Total formula gives it (the same number the customer sees).
 * Margin and cost never reach the list: only what the customer is quoted.
 */
import { followUpReasons, inFilter, quoteValue, torontoDay, valueAmount, type QuoteGroup, type QuoteValue } from "./group";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "$9,640"; "$12.4k" when `short` (ranges and the strip). */
export function money(n: number, short = false): string {
  if (short && Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `$${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

/** The Value column's words: the headline and the quiet line under it. */
export function valueWords(v: QuoteValue | null): { main: string; sub: string | null; title: string } | null {
  if (!v) return null;
  if (v.kind === "contract") return { main: money(v.total), sub: "Contract", title: `Contract total ${money(v.total)}` };
  const opts = `${v.options} option${v.options === 1 ? "" : "s"}`;
  if (v.low === v.high) return { main: money(v.likely), sub: v.options > 1 ? opts : null, title: `${opts}, ${money(v.likely)}` };
  return {
    main: `${money(v.low, true)}–${money(v.high, true)}`,
    sub: v.recommended ? `Rec. ${money(v.likely, true)}` : opts,
    title: `${opts}: ${money(v.low)} to ${money(v.high)}${v.recommended ? `, recommended ${money(v.likely)}` : ""}`,
  };
}

// ---------- the summary strip ----------

export type Pulse = {
  /** Sent and waiting on the customer (the Sent filter): how many, their likely value, and how many have no price. */
  out: { count: number; value: number; unpriced: number };
  followUp: number;
  /** Quotes the customer said yes to this calendar month (Toronto), and what they are worth. */
  acceptedThisMonth: { count: number; value: number };
  linking: number;
};

/** The strip's numbers, over every quote (the search and filter never change them). */
export function pulse(groups: QuoteGroup[], now: Date): Pulse {
  const month = torontoDay(now).slice(0, 7);
  const p: Pulse = { out: { count: 0, value: 0, unpriced: 0 }, followUp: 0, acceptedThisMonth: { count: 0, value: 0 }, linking: 0 };
  for (const g of groups) {
    if (inFilter(g, "sent")) {
      p.out.count++;
      const n = valueAmount(quoteValue(g));
      if (n == null) p.out.unpriced++;
      else p.out.value += n;
    }
    if (followUpReasons(g, now).length) p.followUp++;
    if (inFilter(g, "linking")) p.linking++;
    const yes = g.versions.find((v) => v.acceptedAt && (v.status === "Accepted" || v.status === "Won"));
    if (yes?.acceptedAt && torontoDay(yes.acceptedAt).slice(0, 7) === month) {
      p.acceptedThisMonth.count++;
      p.acceptedThisMonth.value += valueAmount(quoteValue(g)) ?? 0;
    }
  }
  p.out.value = round2(p.out.value);
  p.acceptedThisMonth.value = round2(p.acceptedThisMonth.value);
  return p;
}
