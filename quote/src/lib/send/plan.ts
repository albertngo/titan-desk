import { optionTotals, parityDiffs, stageAmountProblems, stageAmounts } from "@/lib/calc";
import type { Quote } from "@/lib/quotes/types";
import { defaultSchedule, payWords, scheduleProblems } from "@/lib/pricing/schedule";
import type { Acceptance } from "@/lib/accept/plan";
import { changeWords as changeLine, paidLeft } from "@/lib/change/diff";
import { addDays, dollars, hstRow, isIsoDate, isRange, isSplit, scopeLeads, scopeOf, leadPrice, longDate, offersPdf, rangeText, rangeWhy, stageNote, stagesOf, type CopyOption, type CopyStage, type CustomerCopy } from "./copy";
import { copyKind, kindPhrase } from "./summary";

/**
 * Sending a quote (milestone 4, Albert 2026-10-15): the checks before anything leaves, and the
 * exact GHL message bodies Make forwards. Pure and tested (tests/send.test.ts); the server side
 * that carries it out is src/lib/quotes/send.ts.
 *
 * Email and text both go through GHL, so they land in the customer's conversation, from the
 * location's own email and number. The email carries the link and the PDF; the text, the link.
 * The wording follows what is quoted (flooring, stairs or both, 2026-10-18), and the email lists
 * what each option includes, the way the old mobile-quote messages did: src/lib/send/summary.ts.
 */

export type Channels = { email: boolean; sms: boolean };

export type SendInput = {
  /** What the person sending saw (fingerprint of the version when the page opened). */
  base: string;
  /** Null on a preliminary (Albert, 2026-10-22): an estimate has no good-until date. */
  validUntil: string | null;
  channels: Channels;
  /**
   * The options going to the customer (Albert, 2026-10-24), by record id; null or absent = all of
   * them. Everything the customer gets (page, PDF, email, text) is drawn from these only.
   */
  optionIds?: string[] | null;
};

const OPTION_ID = /^rec[A-Za-z0-9]{14}$/;

/** The option ids a request names: a list of record ids, or null for "all". Anything else reads as "all". */
export function parseOptionIds(raw: unknown): string[] | null {
  if (typeof raw === "string") raw = raw.split(",").filter(Boolean);
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && OPTION_ID.test(x)))];
}

/** The quote with only the chosen options, in their order; null = all. An id not on the quote is ignored here and refused by sendProblems. */
export function chooseOptions<Q extends Pick<Quote, "options">>(quote: Q, ids: string[] | null | undefined): Q {
  // Not named: every option still offered (2026-10-30: a Not offered one stays on the quote and off the copy).
  if (!ids) return { ...quote, options: quote.options.filter((o) => !o.notOffered) };
  const keep = new Set(ids);
  return { ...quote, options: quote.options.filter((o) => keep.has(o.id)) };
}

/** "options 1 and 3" for the edit log, numbered as the editor shows them; null when every option went. */
export function chosenWords(quote: Pick<Quote, "options">, ids: string[] | null | undefined): string | null {
  if (!ids) ids = quote.options.filter((o) => !o.notOffered).map((o) => o.id);
  if (quote.options.every((o) => ids.includes(o.id))) return null;
  const nums = quote.options.flatMap((o, i) => (ids.includes(o.id) ? [String(i + 1)] : []));
  return nums.length === 1 ? `option ${nums[0]} only` : `options ${nums.slice(0, -1).join(", ")} and ${nums.at(-1)}`;
}

/**
 * What stops a change going out with its options (Albert, 2026-10-31, vault 05_decisions/2026-10-31-quote-changes-for-record).
 * Everything on a change is part of the project when it is sent, for the record: the first option is the project as
 * agreed and always goes; any other option is new work joining it (a basement, an extra), with or without a Part. Only
 * new work for a Part the customer already has is refused (`contractParts`: each contract item's Part): that belongs
 * on the first option.
 */
export function changeProblems(quote: Pick<Quote, "options">, ids: string[] | null, contractParts: string[]): string[] {
  const [first] = quote.options;
  if (!first) return [];
  const out: string[] = [];
  if (ids && !ids.includes(first.id)) out.push(`${first.name || "The first option"} is the project as agreed: it always goes with a change. Tick it on the Send card.`);
  const covered = new Set(contractParts);
  for (const o of chooseOptions(quote, ids).options) {
    if (o.id !== first.id && o.part && covered.has(o.part)) out.push(`${o.name || "An option"} is for the ${o.part.toLowerCase()}, which the customer already has. Put that work on the first option.`);
  }
  return out;
}

/** What stops one option going to the customer, or null. */
export function optionProblem(quote: Pick<Quote, "discountRate" | "showHst" | "schedule">, o: Quote["options"][number]): string | null {
  const t = optionTotals(o.lines, quote.discountRate, quote.showHst);
  if (t.total <= 0) return `${o.name} has nothing priced in it.`;
  if (parityDiffs(t, o.airtable).length > 0) return `The app and Airtable disagree on ${o.name}. Fix that before sending.`;
  // The schedule's own amounts on this option (2026-10-27): nothing negative, and a deposit that is something.
  const stages = stageAmounts(quote.schedule ?? defaultSchedule(), o.lines, quote.discountRate, quote.showHst, t.total);
  return stageAmountProblems(stages, o.name)[0] ?? null;
}

/**
 * Everything that stops a send. Empty means it may go. Each line is said to staff as is.
 * `skipOptions`: leave out the per-option checks, for the Send card, which applies optionProblem() to
 * whatever is ticked as the sender changes it. The send itself always runs every check.
 */
export function sendProblems(quote: Quote, input: SendInput, ctx: { today: string; fingerprint: string; skipOptions?: boolean; contractParts?: string[] }): string[] {
  const out: string[] = [];
  if (quote.status !== "Draft") out.push(`This version is ${quote.status ?? "not a draft"}. Only a draft is sent; save a new version to send changes.`);
  if (ctx.fingerprint !== input.base) out.push("This version changed since the page opened. Reload it and check it before sending.");
  if (!quote.link?.ghlContactId) out.push("This quote has no GHL contact, so there is nobody to send it to.");
  if (!quote.link?.quoteNumber) out.push("This quote has no quote number yet.");
  if (quote.sendBlock) out.push(quote.sendBlock);
  if (quote.legacyLineCount > 0) out.push("Some lines are in the old A/B/C format and on no option. Move them onto an option first.");
  if (quote.options.length === 0) out.push("This version has no options.");
  if (quote.schedule) out.push(...scheduleProblems(quote.schedule));
  const ids = input.optionIds ?? null;
  // A change after acceptance (2026-10-27) has no good-until date; since 2026-10-31 everything on it is the project.
  if (quote.changeNo) out.push(...changeProblems(quote, ids, ctx.contractParts ?? []));
  if (!ctx.skipOptions) {
    if (ids && quote.options.length > 0) {
      if (ids.length === 0) out.push("Choose at least one option to send.");
      else if (ids.some((id) => !quote.options.some((o) => o.id === id))) out.push("An option you chose is no longer on this version. Reload the page.");
    }
    // Only what goes to the customer is checked: an unticked draft option never blocks a send (2026-10-24).
    for (const o of chooseOptions(quote, ids).options) {
      const p = optionProblem(quote, o);
      if (p) out.push(p);
    }
  }
  // A preliminary carries no good-until date (Albert, 2026-10-22), nor does a change, which is for the record; any date sent with one is ignored.
  if (quote.basis !== "Preliminary" && !quote.changeNo) {
    if (!isIsoDate(input.validUntil)) out.push("Choose the date the quote is good until.");
    else if (input.validUntil < ctx.today) out.push("The valid-until date is in the past.");
    else if (input.validUntil > addDays(ctx.today, 365)) out.push("The valid-until date is more than a year away.");
  }
  if (!input.channels.email && !input.channels.sms) out.push("Choose email, text, or both.");
  if (input.channels.email && !quote.link?.email) out.push("GHL has no email for this customer.");
  if (input.channels.sms && !quote.link?.phone) out.push("GHL has no phone number for this customer.");
  return out;
}

/* ---------- the messages ---------- */

export type GhlMessage =
  /**
   * Never an attachment (Albert, 2026-10-27): the PDF, when offered, is downloaded from the quote page only.
   * The one exception is the acceptance email (Albert, same day: "attach for acceptance only"), which
   * carries the stamped accepted PDF and the Project Expectations it was accepted under; and since 2026-10-30
   * the invoice or receipt email, which carries that document.
   */
  | { type: "Email"; contactId: string; subject: string; html: string; emailFrom?: string; attachments?: string[] }
  | { type: "SMS"; contactId: string; message: string }
  /** A note on the customer's conversation that only staff see (2026-10-27, open tracking); `mentions` are GHL user ids. */
  | { type: "InternalComment"; contactId: string; message: string; mentions: string[] };

/**
 * Who the message comes from (2026-10-22, Albert: "the quote is sent out from the email logged into
 * the app"). `email` is the signed-in quoter's address; `firstName` signs the text and makes the
 * From name ("Albert @ Titan Flooring", the convention GHL's own emails already use). Null = the
 * location's default sender, which GHL uses when no `emailFrom` is given.
 */
export type Sender = { email: string; firstName: string | null };

/**
 * The From line for GHL's `emailFrom`. The quoter's address is used only on the company's own
 * domain (the letterhead email's), because GHL can send only from a domain it has verified; a
 * quoter signed in with any other address falls back to the location default. `named` puts the
 * display name in front; the send tries that first and the bare address second (plan: send.ts).
 */
export function emailFromFor(sender: Sender | null, companyEmail: string | null, named: boolean): string | null {
  if (!sender) return null;
  const domain = (e: string) => e.trim().toLowerCase().split("@")[1] ?? "";
  if (companyEmail && domain(companyEmail) && domain(sender.email) !== domain(companyEmail)) return null;
  const address = sender.email.trim().toLowerCase();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(address)) return null;
  return named && sender.firstName ? `${sender.firstName} @ ${COMPANY} <${address}>` : address;
}

const COMPANY = "Titan Flooring";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

/** "Jane" for the greeting; never a surname alone, never a guess. */
export function greetingName(first: string | null | undefined): string | null {
  const f = (first ?? "").trim().split(/\s+/)[0];
  return f && /^[\p{L}][\p{L}'’-]*$/u.test(f) ? f : null;
}

/*
 * The email's look (2026-10-22, Albert: recreate the GHL "Rough quote is ready" template and
 * improve on it). What it keeps from that template: the cream header band with the logo, the dark
 * ink, the shape a customer already knows (greeting, what's included, the total, one button, next
 * steps, footer). What changed: the page is warm paper instead of pale blue, the logo is letterhead
 * size instead of column width, a serif headline in a plain sentence replaces the emoji greeting,
 * small blue eyebrows replace underlined titles, the summary is a left-aligned card with the total
 * set large, the button is a pill, and the carousel, click tracking and unsubscribe line are gone
 * (a quote is transactional). The accent is the logo's own blue, not the template's terracotta,
 * so the email, the customer page and the PDF read as one brand. Email-safe: tables, inline
 * styles, a 600px column that collapses under 620px, no web fonts (Gmail and Outlook ignore
 * them; Georgia and the system sans stack are what every client has).
 */
const C = {
  page: "#efe9df",
  cream: "#f3f1e7",
  card: "#ffffff",
  ink: "#2b2a27",
  body: "#4a4742",
  muted: "#85807a",
  faint: "#a39d95",
  hair: "#e4ddd0",
  wash: "#f8f5ef",
  accent: "#283890",
  accentDeep: "#1f2d75",
} as const;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif";

const row = (inner: string, pad = "0 40px") => `<tr><td class="pad" style="padding:${pad};">${inner}</td></tr>`;
const eyebrow = (text: string) =>
  `<p style="margin:0 0 8px;font-family:${SANS};font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:${C.accent};font-weight:600;">${text}</p>`;
/**
 * A preliminary's header (Albert, 2026-10-27: "Preliminary should be more apparent as a header"): a
 * solid blue tag in place of the small eyebrow, so nobody reads the estimate as a measured quote.
 */
const prelimTag = (text: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;border-collapse:separate;"><tr>` +
  `<td bgcolor="${C.accent}" style="border-radius:8px;padding:9px 16px;mso-padding-alt:9px 16px;font-family:${SANS};font-size:15px;line-height:1.2;letter-spacing:.16em;text-transform:uppercase;color:#ffffff;font-weight:700;">${text}</td>` +
  `</tr></table>`;
const para = (text: string, size = 16, color: string = C.body, margin = "0 0 16px", extra = "") =>
  `<p style="margin:${margin};font-family:${SANS};font-size:${size}px;line-height:1.6;color:${color};${extra}">${text}</p>`;
const hairline = (pad = "28px 40px") => row(`<div style="height:1px;line-height:1px;font-size:1px;background:${C.hair};">&nbsp;</div>`, pad);

function button(label: string, href: string, primary = true): string {
  const bg = primary ? C.accent : C.card;
  const fg = primary ? "#ffffff" : C.ink;
  const ring = primary ? "" : `box-shadow:inset 0 0 0 1px ${C.hair};`;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:separate;">` +
    `<tr><td align="center" bgcolor="${bg}" style="border-radius:999px;${ring}mso-padding-alt:14px 28px;">` +
    `<a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:15px;font-weight:600;letter-spacing:.01em;color:${fg};text-decoration:none;border-radius:999px;">${label}&nbsp;&nbsp;&rarr;</a>` +
    `</td></tr></table>`
  );
}

/**
 * One option as a card in a cream tray: a title and the total set large, nothing else (Albert,
 * 2026-10-31: "in the email I just want them to actually go into the link to see it"). What it
 * includes, the materials and the payment schedule are on the quote page; the line under the total
 * says so. Before then the card listed each line with its quantity and the timing.
 */
function optionCard(o: CopyOption, copy: CustomerCopy): string {
  const prelim = copy.basis === "Preliminary";
  const title = prelim ? "Your estimate" : "Your quote";
  const r = o.range;
  const totalLabel = r ? "Estimated range" : prelim ? "Rough total" : "Total";
  // Before HST, set large, with the HST and the with-HST total as two quiet lines under it (2026-10-24).
  const lead = leadPrice(copy, o.totals);
  const tax = hstRow(copy, o.totals);
  const small = (label: string, amount: string) =>
    `<tr><td style="padding:3px 0 0;font-family:${SANS};font-size:13px;color:${C.muted};">${label}</td><td align="right" style="padding:3px 0 0;font-family:${SANS};font-size:13px;color:${C.muted};white-space:nowrap;">${amount}</td></tr>`;
  // A range has no exact HST to show (2026-10-27): only the range with HST in it.
  const after = r ? small("With HST", rangeText(r.lowWithHst, r.highWithHst)) : tax.amount !== null ? small(esc(tax.label), cad.format(tax.amount)) + small("With HST", cad.format(o.totals.total)) : "";
  const breakdown = lead.addsHst && tax.amount !== null
    ? `<tr><td colspan="2" style="padding:10px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.hair};">` +
      `<tr><td colspan="2" style="height:6px;line-height:6px;font-size:1px;">&nbsp;</td></tr>` +
      after +
      `</table></td></tr>`
    : "";
  // "+ HST" sits beside the number; the line under the label speaks only when it has something to add.
  const label = `${totalLabel}${lead.addsHst && copy.showHst ? "" : `<br><span style="font-size:12px;letter-spacing:0;text-transform:none;">${lead.addsHst ? "HST on materials only" : "before HST"}</span>`}`;
  const plus = lead.addsHst ? `<span style="font-family:${SANS};font-size:14px;color:${C.muted};white-space:nowrap;"> + HST</span>` : "";
  const labelStyle = `font-family:${SANS};font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};`;
  // A range is two figures, so it sits under its label rather than beside it, and breaks only between the two on a phone.
  const figure = r
    ? `<tr><td colspan="2" style="${labelStyle}">${label}</td></tr>` +
      `<tr><td colspan="2" class="total" style="padding:6px 0 0;font-family:${SERIF};font-size:30px;line-height:1.25;color:${C.ink};"><span style="white-space:nowrap;">${dollars(r.low)} &ndash;</span> <span style="white-space:nowrap;">${dollars(r.high)}</span>${plus}</td></tr>`
    : `<tr><td style="${labelStyle}">${label}</td>` +
      `<td align="right" class="total" style="font-family:${SERIF};font-size:30px;color:${C.ink};"><span style="white-space:nowrap;">${cad.format(lead.amount)}</span>${plus}</td></tr>`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.wash};border-radius:18px;"><tr><td style="padding:8px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border:1px solid ${C.hair};border-radius:12px;">` +
    `<tr><td style="padding:22px 24px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="font-family:${SERIF};font-size:20px;color:${C.ink};">${title}</td></tr></table></td></tr>` +
    `<tr><td style="padding:12px 24px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `${figure}${breakdown}</table></td></tr>` +
    `<tr><td style="padding:14px 24px 20px;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">${ON_PAGE("What&rsquo;s included")}</td></tr>` +
    `</table></td></tr></table>`
  );
}

/** The line under the email's prices that sends the customer to the page for the rest (2026-10-31). */
const ON_PAGE = (what: string) => `${what}, the materials and the payment schedule are on your quote page.`;

/** Two or more options (three or more 2026-10-24, two since 2026-10-31): one card listing each option's name and its price before HST. */
function optionList(copy: CustomerCopy): string {
  const prelim = copy.basis === "Preliminary";
  const rows = copy.options
    .map((o, i) => {
      const lead = leadPrice(copy, o.totals);
      const price = o.range ? `${dollars(o.range.low)} &ndash; ${dollars(o.range.high)}` : cad.format(lead.amount);
      const badge = o.recommended
        ? ` <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background:${C.cream};font-family:${SANS};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.accentDeep};font-weight:600;vertical-align:2px;">Recommended</span>`
        : "";
      const name = `<span style="color:${C.muted};font-size:13px;">${isSplit(copy) ? `${scopeOf(o)} &middot; ` : ""}Option ${i + 1}</span><br>${esc(o.name)}${badge}`;
      // A range is two figures: it goes under the name, so a phone never squeezes the name into a narrow column (2026-10-31).
      if (o.range)
        return (
          `<tr><td colspan="2" style="padding:13px 0;border-bottom:1px solid ${C.hair};font-family:${SANS};font-size:15px;color:${C.ink};">${name}<br>` +
          `<span style="display:inline-block;padding-top:6px;font-family:${SERIF};font-size:20px;color:${C.ink};white-space:nowrap;">${price}</span>` +
          `<span style="font-family:${SANS};font-size:12px;color:${C.muted};"> ${esc(lead.tag)}</span></td></tr>`
        );
      return (
        `<tr><td style="padding:13px 0;border-bottom:1px solid ${C.hair};font-family:${SANS};font-size:15px;color:${C.ink};">${name}</td>` +
        `<td align="right" valign="bottom" style="padding:13px 0;border-bottom:1px solid ${C.hair};white-space:nowrap;">` +
        `<span style="font-family:${SERIF};font-size:20px;color:${C.ink};">${price}</span>` +
        `<span style="font-family:${SANS};font-size:12px;color:${C.muted};"> ${esc(lead.tag)}</span></td></tr>`
      );
    })
    .join("");
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.wash};border-radius:18px;"><tr><td style="padding:8px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border:1px solid ${C.hair};border-radius:12px;">` +
    `<tr><td style="padding:22px 24px 4px;font-family:${SERIF};font-size:20px;color:${C.ink};">Your ${copy.options.length} options</td></tr>` +
    `<tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>` +
    `<tr><td style="padding:14px 24px 20px;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">${isRange(copy) ? "Estimated ranges. " : prelim ? "Rough prices. " : ""}${ON_PAGE("What each option includes")}</td></tr>` +
    `</table></td></tr></table>`
  );
}

function steps(items: [string, string][]): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    items
      .map(
        ([title, text], i) =>
          `<tr><td valign="top" width="40" style="padding:0 16px 18px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td align="center" width="32" height="32" bgcolor="${C.cream}" style="border-radius:999px;font-family:${SERIF};font-size:15px;color:${C.accentDeep};line-height:32px;">${i + 1}</td></tr></table></td>` +
          `<td valign="top" style="padding:0 0 18px;"><p style="margin:0 0 2px;font-family:${SANS};font-size:15px;font-weight:600;color:${C.ink};">${title}</p>` +
          `<p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.55;color:${C.body};">${text}</p></td></tr>`,
      )
      .join("") +
    `</table>`
  );
}

/** The frame every quote email shares: paper, the cream band with the logo, the white card, the letterhead footer. */
function frame(copy: CustomerCopy, title: string, preheader: string, body: string): string {
  const co = copy.company;
  const logo = co.logoUrl
    ? `<img src="${esc(co.logoUrl)}" width="210" alt="${esc(co.name.toUpperCase())}" style="display:block;width:210px;max-width:100%;height:auto;margin:0 auto;font-family:${SERIF};font-size:22px;letter-spacing:.18em;color:${C.ink};">`
    : `<p style="margin:0;font-family:${SERIF};font-size:22px;letter-spacing:.18em;text-transform:uppercase;color:${C.accent};">${esc(co.name)}</p>`;
  const tel = co.phone ? `<a href="tel:${esc(co.phone.replace(/[^\d+]/g, ""))}" style="color:${C.muted};text-decoration:none;">${esc(co.phone)}</a>` : "";
  const site = co.website ? `<a href="${esc(/^https?:/.test(co.website) ? co.website : `https://${co.website}`)}" style="color:${C.muted};text-decoration:none;">${esc(co.website.replace(/^https?:\/\//, ""))}</a>` : "";
  const footerLines = [
    [co.address ? esc(co.address) : "", tel].filter(Boolean).join(" &nbsp;&middot;&nbsp; "),
    [site, co.email ? `<a href="mailto:${esc(co.email)}" style="color:${C.muted};text-decoration:none;">${esc(co.email)}</a>` : ""].filter(Boolean).join(" &nbsp;&middot;&nbsp; "),
  ].filter(Boolean);
  return (
    `<!doctype html><html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head>` +
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">` +
    `<title>${esc(title)}</title>` +
    `<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->` +
    `<style>body{margin:0;padding:0;-webkit-text-size-adjust:100%}table{border-collapse:collapse}img{border:0;line-height:100%;outline:none;text-decoration:none}` +
    `@media only screen and (max-width:620px){.wrap{width:100% !important}.pad{padding-left:22px !important;padding-right:22px !important}.h1{font-size:26px !important}.total{font-size:26px !important}}</style></head>` +
    `<body style="margin:0;padding:0;background:${C.page};">` +
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${C.page};">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};"><tr><td align="center" style="padding:32px 12px 48px;">` +
    `<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->` +
    `<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">` +
    `<tr><td align="center" bgcolor="${C.cream}" style="background:${C.cream};border-radius:18px 18px 0 0;padding:30px 40px 26px;">${logo}</td></tr>` +
    `<tr><td style="height:1px;line-height:1px;font-size:1px;background:${C.hair};">&nbsp;</td></tr>` +
    `<tr><td bgcolor="${C.card}" style="background:${C.card};border-radius:0 0 18px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}<tr><td style="padding:0 0 8px;"></td></tr></table></td></tr>` +
    `<tr><td style="padding:28px 24px 0;" align="center">` +
    `<p style="margin:0 0 6px;font-family:${SERIF};font-size:15px;letter-spacing:.2em;text-transform:uppercase;color:${C.ink};">${esc(co.name)}</p>` +
    (footerLines.length ? `<p style="margin:0 0 10px;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.muted};">${footerLines.join("<br>")}</p>` : "") +
    `<p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.6;color:${C.faint};">You&rsquo;re receiving this because you asked ${esc(co.name)} for a quote. Reply to this email and it reaches us directly.</p>` +
    `</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`
  );
}

/**
 * The payment schedule in words, from the frozen schedule (2026-10-27): each stage, when it is due
 * and how it is paid, then what the deposit does. Albert, the same day: "Nothing is finalized until a
 * deposit is made… the date you request is locked in for you" (the PM sets the date).
 */
export function paymentWords(o: CopyOption): string {
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const phrase = (s: CopyStage, i: number) => {
    const what =
      s.kind === "balance"
        ? "the balance"
        : s.kind === "materials"
          ? `${i === 0 ? "a deposit" : lower(s.label)} of ${s.amount !== null ? cad.format(s.amount) : "the material's price"} for your materials`
          : s.kind === "amount" && s.amount !== null
            ? `${cad.format(s.amount)} ${lower(s.label)}`
            : `${s.pct ?? ""}% ${i === 0 ? "deposit" : lower(s.label)}`;
    const when = s.when ? ` ${lower(s.when).replace(/, for your materials.*$/, "")}` : "";
    const how = payWords(s.pay);
    return `${what}${when}${how ? `, ${how}` : ""}`;
  };
  const parts = stagesOf(o).map(phrase);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join("; ")}; and ${parts.at(-1)}` : parts[0];
  return `${list.charAt(0).toUpperCase()}${list.slice(1)}. Nothing is final until the deposit is in; once it is, your materials are ordered and your date is locked in.`;
}

export function emailMessage(
  copy: CustomerCopy,
  to: { contactId: string; firstName: string | null; link: string },
  sender: Sender | null = null,
  options: { emailFrom?: string | null; booking?: { inStore: string; inHome: string } | null; acceptOnline?: boolean } = {},
): GhlMessage {
  const hi = greetingName(to.firstName);
  const prelim = copy.basis === "Preliminary";
  // Online acceptance (2026-10-27): a measured quote says to accept it on the page once it is switched on.
  const online = !prelim && options.acceptOnline === true;
  const several = copy.options.length > 1;
  const phrase = kindPhrase(copyKind(copy), false); // "flooring and stairs quote"
  const what = phrase.replace(/ quote$/, "");
  const noun = prelim ? "estimate" : "quote";
  const subject = `Your ${prelim ? `${what} estimate` : phrase} ${copy.quoteNumber} from ${copy.company.name}`;
  // Every amount leads before HST (2026-10-24); with several options, the lowest.
  const leads = copy.options.map((o) => leadPrice(copy, o.totals));
  const low = leads.reduce((a, b) => (b.amount < a.amount ? b : a));
  // A preliminary's range (2026-10-27): its low end for "from", the whole range for one option.
  const ranged = isRange(copy);
  const r0 = copy.options[0].range;
  const lowEnd = ranged ? Math.min(...copy.options.map((o) => o.range?.low ?? leadPrice(copy, o.totals).amount)) : low.amount;
  // Flooring and stairs (2026-10-28): each scope's price on its own, never one "from" across both.
  const split = isSplit(copy);
  const preheader = split
    ? `${scopeLeads(copy, (n) => cad.format(n)).map((x) => `${x.scope} ${x.phrase}`).join(" · ")}${copy.validUntil ? ` · good until ${longDate(copy.validUntil)}` : ""}`
    : several
    ? `${copy.options.length} options to look at, from as low as ${ranged ? dollars(lowEnd) : cad.format(lowEnd)} ${low.tag}${copy.validUntil ? ` · good until ${longDate(copy.validUntil)}` : ""}`
    : r0
      ? `Estimated range ${rangeText(r0.low, r0.high)} ${leads[0].tag}`
      : `${prelim ? "Rough total" : "Total"} ${cad.format(leads[0].amount)} ${leads[0].tag}${copy.validUntil ? ` · good until ${longDate(copy.validUntil)}` : ""}`;

  const headline = `${hi ? `Hi ${esc(hi)}, your` : "Your"} ${esc(what === "quote" ? "" : what).trim()} ${noun} is ready.`.replace(/\s+/g, " ");
  // A preliminary always goes before anyone has measured (Albert, 2026-10-27: a preliminary is solely a
  // quote before a visit or measurement; one sent after a measure is a measured quote), so it opens
  // generically. The "we've been to the home" switch (2026-10-24) is gone. Since 2026-10-27 it is a range.
  // Several options (2026-10-31): the count and the lowest price, so the customer opens the page to compare.
  const lowest = `${ranged ? dollars(lowEnd) : cad.format(lowEnd)} ${esc(low.tag)}`;
  const intro = prelim && several && !split
    ? `Thanks for telling us about your project. ${severalWords(copy.options.length, lowest)}, based on what you&rsquo;ve described. ${ranged ? `${esc(rangeWhy(copy))} ` : ""}Once you&rsquo;ve picked a material and we&rsquo;ve measured, we confirm the final price.`
    : prelim && ranged
    ? `Thanks for telling us about your project. Here is a price range based on what you&rsquo;ve described. ${esc(rangeWhy(copy))} Once you&rsquo;ve picked a material and we&rsquo;ve measured, we confirm the final price.`
    : prelim
    ? `Thanks for telling us about your project. Here is a rough number based on what you&rsquo;ve described. Once you&rsquo;ve picked a material and we&rsquo;ve measured, we confirm the final price.`
    : split
      ? `Flooring and stairs are quoted side by side: take one option of each, or just one of them. Open the quote to see every detail and the payment schedule.`
    : several
      ? `${severalWords(copy.options.length, lowest)}. Open the quote to see every detail and the payment schedule.`
      : `Everything we talked about is in the quote, with the payment schedule. Open it to see the detail.`;

  // Albert, 2026-10-31: the email gives the price and sends them to the page for the rest. Several options:
  // one list of names and prices (from three since 2026-10-24, from two since 2026-10-31); one option: its price.
  const cards = row(several ? optionList(copy) : optionCard(copy.options[0], copy), "0 40px 16px");
  // The PDF is never attached (Albert, 2026-10-27): an attachment is a copy we can never see opened. When the
  // sender offers it, it is downloaded from the quote page; otherwise the page has no PDF and the email says nothing.
  const under = [
    offersPdf(copy) ? "You can download a PDF from the quote page." : "",
    copy.validUntil ? `This ${noun} is good until <b style="color:${C.ink};font-weight:600;">${esc(longDate(copy.validUntil))}</b>.` : prelim ? "The link doesn&rsquo;t expire." : "",
  ]
    .filter(Boolean)
    .join(" ");
  // A step's own link (2026-10-23): the in-store calendar on the showroom step, the in-home one on the measurement step.
  const stepLink = (href: string | undefined, label: string) => (href ? ` <a href="${esc(href)}" style="color:${C.accent};font-weight:600;text-decoration:none;white-space:nowrap;">${label}&nbsp;&rarr;</a>` : "");
  const next: [string, string][] = prelim
    ? [
        ["Visit the showroom", `See and feel the samples in person. Fifteen minutes is usually enough to narrow it to two or three.${stepLink(options.booking?.inStore, "Book a showroom visit")}`],
        ["We measure and confirm", `A measured quote replaces this estimate, with the exact ${what.includes("stair") && !what.includes("flooring") ? "scope" : "square footage"} and your chosen material.${stepLink(options.booking?.inHome, "Book a measurement")}`],
        ["Pick a date", "Most projects start within two to three weeks of a confirmed quote."],
      ]
    : online
      ? [
          ["Accept online", `${several ? "Open the quote, pick your option" : "Open the quote"} and press Accept. You&rsquo;ll get the accepted quote and the deposit details straight away.`],
          ["Send the deposit", "Nothing is final until it&rsquo;s in. Once it is, your materials are ordered and your date is locked in."],
          ["Install", "We confirm the crew&rsquo;s arrival the day before they start."],
        ]
      : [
          [several ? "Choose an option" : "Say yes", several ? "Reply with the one you want, or tell us if you&rsquo;d like a mix." : "Reply to this email, or call us, and we hold your dates."],
          ["We hold your dates", "Once the deposit is in, your start date is yours and the material is ordered."],
          ["Install", "We confirm the crew&rsquo;s arrival the day before they start."],
        ];
  const signoff = sender?.firstName ? `${esc(sender.firstName)} &middot; ${esc(copy.company.name)}` : `The ${esc(copy.company.name)} team`;
  const ask = sender?.firstName ? ` Ask for ${esc(sender.firstName)}.` : "";
  const phone = copy.company.phone ? ` or call <a href="tel:${esc(copy.company.phone.replace(/[^\d+]/g, ""))}" style="color:${C.ink};">${esc(copy.company.phone)}</a>` : "";

  const body =
    row(
      (prelim ? prelimTag("Preliminary estimate") : eyebrow(`Quote${copy.version !== null ? ` &middot; version ${copy.version}` : ""}`)) +
        `<p style="margin:-2px 0 14px;font-family:${SANS};font-size:12px;color:${C.muted};letter-spacing:.04em;">${esc(copy.quoteNumber)} &middot; ${esc(longDate(copy.sentOn))}</p>` +
        `<h1 class="h1" style="margin:0 0 16px;font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.2;color:${C.ink};letter-spacing:-.01em;">${headline}</h1>` +
        para(intro),
      "40px 40px 24px",
    ) +
    cards +
    row(button(online ? (several ? "Compare and accept" : `View and accept your ${noun}`) : several ? `View and compare your ${noun}` : `View your ${noun}`, to.link), "12px 40px 10px") +
    row(para(under, 13, C.muted, "0", "text-align:center;"), "0 40px 8px") +
    (prelim ? "" : hairline() + row(eyebrow("How payment works") + para(esc(paymentWords(copy.options[0])), 15, C.body, "0 0 6px"))) +
    hairline(prelim ? "28px 40px" : "22px 40px 28px") +
    row(eyebrow("What happens next") + steps(next), "0 40px 6px") +
    // The step's own "Book a showroom visit" link is the one way to book (2026-10-27): the separate
    // "Book an in-store visit" button under the steps said the same thing twice and is gone.
    hairline("0 40px 28px") +
    row(para(`Questions? Reply to this email${phone}.${ask}`, 15, C.body, "0 0 4px") + para(signoff, 14, C.muted, "0 0 36px"));

  // An explicit `emailFrom` wins, null included (the send's retries pass the bare address, then none).
  const from = "emailFrom" in options ? options.emailFrom : emailFromFor(sender, copy.company.email, true);
  return {
    type: "Email",
    contactId: to.contactId,
    subject,
    html: frame(copy, subject, preheader, body),
    ...(from ? { emailFrom: from } : {}),
  };
}

/**
 * The text (2026-10-22): who is texting, the one number they care about, the link on its own
 * line, how to reply. Straight apostrophes on purpose: one curly quote or emoji switches the
 * whole message to UCS-2 and halves each segment.
 */
export function smsMessage(copy: CustomerCopy, to: { contactId: string; firstName: string | null; link: string }, sender: Sender | null = null): GhlMessage {
  const hi = greetingName(to.firstName);
  const prelim = copy.basis === "Preliminary";
  const several = copy.options.length > 1;
  const kind = kindPhrase(copyKind(copy), false).replace(/ quote$/, "");
  const whoFrom = sender?.firstName ? `it's ${sender.firstName} from ${copy.company.name}` : `it's ${copy.company.name}`;
  // Every amount before HST, "+ HST" after it (2026-10-24); with several options, the lowest (lowestLead, below).
  const leads = copy.options.map((o) => leadPrice(copy, o.totals));
  const money = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString("en-CA")}` : cad.format(n));
  const first = hi ? `Hi ${hi}, ${whoFrom}.` : `Hi, ${whoFrom}.`;
  // Layout (Albert, 2026-10-24): the news, a blank line, "See the full details here:" with the link on
  // its own line, a blank line, how to reply. No phone number: the reply goes to the same thread.
  const r0 = copy.options[0].range;
  // Flooring and stairs (2026-10-28): each scope's price on its own, " to " for a range (GSM-7).
  const split = isSplit(copy);
  const scopeWords = scopeLeads(copy, money, " to ").map((x) => `${x.scope.toLowerCase()} ${x.phrase}`).join(", ");
  const lowest = lowestLead(copy);
  const fromWords = severalWords(copy.options.length, `${money(lowest.amount)} ${lowest.tag}`);
  const what = prelim && split
    ? `Thanks for telling us about your project. Your estimate: ${scopeWords}.`
    : prelim && several
    ? `Thanks for telling us about your project. ${fromWords}.`
    : prelim
    ? r0
      ? // A range (2026-10-27), with " to ": an en dash is not GSM-7.
        `Thanks for telling us about your project. Your ${kind === "quote" ? "" : `${kind} `}estimate is ${rangeText(r0.low, r0.high, " to ")} ${leads[0].tag}.`
      : `Thanks for telling us about your project. Your rough ${kind === "quote" ? "" : `${kind} `}estimate is ${money(leads[0].amount)} ${leads[0].tag}.`
    : split
      ? `Your quote is ready: ${scopeWords}${copy.validUntil ? `, good until ${shortDate(copy.validUntil)}` : ""}.`
    : several
      ? `${fromWords}${copy.validUntil ? `, good until ${shortDate(copy.validUntil)}` : ""}.`
      : `Your ${kind === "quote" ? "" : `${kind} `}quote is ready, ${money(leads[0].amount)} ${leads[0].tag}${copy.validUntil ? `, good until ${shortDate(copy.validUntil)}` : ""}.`;
  const close = prelim
    ? several && !split
      ? `Each option shows its ${isRange(copy) ? "price range" : "rough price"}. Any questions, just reply.`
      : r0 || (split && isRange(copy))
      ? "The final price should land in that range. Any questions, just reply."
      : "We confirm the price once we've measured. Any questions, just reply."
    : several
      ? "Reply here with the one you'd like, or with any questions."
      : "Reply here if anything needs changing.";
  return { type: "SMS", contactId: to.contactId, message: `${first} ${what}\n\nSee the full details here:\n${to.link}\n\n${close}` };
}

/**
 * The words for several options (Albert, 2026-10-31: "There are multiple options for you to take a look
 * at, from as low as" the lowest): the count, and the lowest price before HST (a range's low end).
 */
export function severalWords(count: number, lowest: string): string {
  return `There are ${count} options for you to take a look at, from as low as ${lowest}`;
}

/** The lowest price any option leads with: a range's low end, else its price before HST. */
function lowestLead(copy: CustomerCopy): { amount: number; tag: string; ranged: boolean } {
  const all = copy.options.map((o) => ({ amount: o.range?.low ?? leadPrice(copy, o.totals).amount, tag: leadPrice(copy, o.totals).tag, ranged: !!o.range }));
  return all.reduce((a, b) => (b.amount < a.amount ? b : a));
}

/** "Nov 21" for a text. */
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" });
}

/* ---------- after the yes (2026-10-27) ---------- */

/** Where the deposit goes and how, in the customer's words; never says why a stage is paid the way it is. */
export function depositHow(deposit: Pick<CopyStage, "pay">, ctx: { etransfer: string; quoteNumber: string }): string {
  if (deposit.pay === "onsite") return "Hand it to your project manager on site.";
  return `Send it by e-transfer to ${ctx.etransfer} and put ${ctx.quoteNumber} in the message.`;
}

/**
 * The email that goes out the moment a quote is accepted (Albert, 2026-10-27): it locks the deal in.
 * The stamped accepted PDF and the Project Expectations they ticked are attached; it is also the one
 * deposit request (GHL's own deposit text is switched off when this goes live), with the amount and
 * how to pay, and the rest of the schedule. The PM sets the date.
 */
export function acceptedEmailMessage(
  copy: CustomerCopy,
  a: Acceptance,
  to: { contactId: string; firstName: string | null; link: string; pdfUrl: string; termsUrl: string | null },
  ctx: { etransfer: string; acceptedWhen: string },
  sender: Sender | null = null,
  options: { emailFrom?: string | null } = {},
): GhlMessage {
  const hi = greetingName(to.firstName);
  const subject = `Accepted: your quote ${copy.quoteNumber} from ${copy.company.name}`;
  const deposit = a.stages[0];
  const preheader = `Your deposit is ${cad.format(deposit.amount ?? 0)}. ${depositHow(deposit, { etransfer: ctx.etransfer, quoteNumber: copy.quoteNumber })}`;
  const cell = (t: string, right = false, strong = false) =>
    `<td${right ? ' align="right"' : ""} style="padding:9px 0;border-bottom:1px solid ${C.hair};font-family:${SANS};font-size:15px;color:${strong ? C.ink : C.body};${strong ? "font-weight:600;" : ""}${right ? "white-space:nowrap;" : ""}">${t}</td>`;
  const what = [
    `<tr>${cell(esc(a.option.name), false, true)}${cell("", true)}</tr>`,
    ...a.addOns.map((x) => `<tr>${cell(`Added: ${esc(x.description)}`)}${cell(cad.format(x.amount), true)}</tr>`),
    `<tr>${cell("Price before HST")}${cell(cad.format(a.totals.subtotal), true)}</tr>`,
    `<tr>${cell(a.totals.hst ? "HST" : "HST not included")}${cell(a.totals.hst ? cad.format(a.totals.hst) : "", true)}</tr>`,
    `<tr>${cell("Total", false, true)}${cell(cad.format(a.totals.total), true, true)}</tr>`,
  ].join("");
  const card = (inner: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.wash};border-radius:18px;"><tr><td style="padding:8px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border:1px solid ${C.hair};border-radius:12px;"><tr><td style="padding:20px 24px;">${inner}</td></tr></table></td></tr></table>`;
  const stageRows = a.stages
    .map((s, i) => `<tr>${cell(`${esc(s.label)}${stageNote(s) ? `<br><span style="font-size:13px;font-weight:400;color:${C.muted};">${esc(stageNote(s))}</span>` : ""}`, false, i === 0)}${cell(s.amount !== null ? cad.format(s.amount) : "", true, i === 0)}</tr>`)
    .join("");
  const attached = [to.pdfUrl ? "your accepted quote" : null, to.termsUrl ? "our Project Expectations" : null].filter(Boolean).join(" and ");
  const signoff = sender?.firstName ? `${esc(sender.firstName)} &middot; ${esc(copy.company.name)}` : `The ${esc(copy.company.name)} team`;
  const who = sender?.firstName ? esc(sender.firstName) : "We";
  const body =
    row(
      eyebrow(`Accepted &middot; ${esc(copy.quoteNumber)}`) +
        `<h1 class="h1" style="margin:0 0 16px;font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.2;color:${C.ink};">${hi ? `Thank you, ${esc(hi)}.` : "Thank you."} Your quote is accepted.</h1>` +
        para(`You accepted on ${esc(ctx.acceptedWhen)}.${attached ? ` ${attached.charAt(0).toUpperCase()}${attached.slice(1)} ${attached.includes(" and ") ? "are" : "is"} attached.` : ""}`),
      "40px 40px 20px",
    ) +
    row(card(`<p style="margin:0 0 6px;font-family:${SERIF};font-size:20px;color:${C.ink};">What you accepted</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${what}</table>`), "0 40px 16px") +
    row(
      card(
        `<p style="margin:0 0 4px;font-family:${SANS};font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};">Your deposit</p>` +
          `<p class="total" style="margin:0 0 10px;font-family:${SERIF};font-size:30px;color:${C.ink};">${cad.format(deposit.amount ?? 0)}</p>` +
          para(esc(depositHow(deposit, { etransfer: ctx.etransfer, quoteNumber: copy.quoteNumber })), 15, C.ink, "0 0 8px") +
          para("Nothing is final until the deposit is in. Once it is, your materials are ordered and your date is locked in.", 14, C.body, "0"),
      ),
      "0 40px 16px",
    ) +
    row(button("View your accepted quote", to.link), "12px 40px 10px") +
    hairline() +
    row(eyebrow("Your payment schedule") + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stageRows}</table>`) +
    hairline("22px 40px 28px") +
    row(
      eyebrow("What happens next") +
        steps([
          ["Send the deposit", "It secures your materials, so they don&rsquo;t go out of stock, and your dates."],
          ["We set your date", `${who} will call you to set your start date. Once the deposit is in, it&rsquo;s locked in.`],
          ["Install", "We confirm the crew&rsquo;s arrival the day before they start."],
        ]),
      "0 40px 6px",
    ) +
    hairline("0 40px 28px") +
    row(para("Questions? Reply to this email.", 15, C.body, "0 0 4px") + para(signoff, 14, C.muted, "0 0 36px"));
  const from = "emailFrom" in options ? options.emailFrom : emailFromFor(sender, copy.company.email, true);
  const attachments = [to.pdfUrl, to.termsUrl].filter((u): u is string => Boolean(u));
  return { type: "Email", contactId: to.contactId, subject, html: frame(copy, subject, preheader, body), ...(attachments.length ? { attachments } : {}), ...(from ? { emailFrom: from } : {}) };
}

/** The text after the yes: thanks, the deposit and how to pay it, the link. GSM-7 only, like every quote text. */
export function acceptedSmsMessage(copy: CustomerCopy, a: Acceptance, to: { contactId: string; firstName: string | null; link: string }, ctx: { etransfer: string }, sender: Sender | null = null): GhlMessage {
  const hi = greetingName(to.firstName);
  const whoFrom = sender?.firstName ? `it's ${sender.firstName} from ${copy.company.name}` : `it's ${copy.company.name}`;
  const deposit = a.stages[0];
  const amount = cad.format(deposit.amount ?? 0);
  const how = deposit.pay === "onsite" ? "Please hand it to your project manager on site." : `Please e-transfer it to ${ctx.etransfer} and put ${copy.quoteNumber} in the message.`;
  return {
    type: "SMS",
    contactId: to.contactId,
    message: `${hi ? `Hi ${hi}, ${whoFrom}.` : `Hi, ${whoFrom}.`} Thank you for accepting quote ${copy.quoteNumber}! Your deposit is ${amount}. ${how} Once it's in, your date is locked in.\n\nYour accepted quote:\n${to.link}`,
  };
}

/* ---------- a change after acceptance (2026-10-27) ---------- */

/**
 * The email for a change (Albert, 2026-10-27: "verbal, sent for record"): the updated quote, with what
 * changed since they accepted at the top, the new total and the new schedule. There is no button to
 * approve it and no deadline: the Project Expectations say a change agreed in person or by phone is
 * confirmed by this message.
 */
export function changeEmailMessage(copy: CustomerCopy, to: { contactId: string; firstName: string | null; link: string }, sender: Sender | null = null, options: { emailFrom?: string | null } = {}): GhlMessage {
  const c = copy.change!;
  const o = copy.options[0];
  const hi = greetingName(to.firstName);
  const subject = `Your updated quote ${copy.quoteNumber} (change ${c.no}) from ${copy.company.name}`;
  const preheader = `As we discussed: the new total is ${cad.format(o.totals.total)}${o.totals.hst ? " with HST" : ""}.`;
  const cell = (t: string, right = false, strong = false) =>
    `<td${right ? ' align="right"' : ""} style="padding:9px 0;border-bottom:1px solid ${C.hair};font-family:${SANS};font-size:15px;color:${strong ? C.ink : C.body};${strong ? "font-weight:600;" : ""}${right ? "white-space:nowrap;" : ""}">${t}</td>`;
  const signed = (n: number) => (Math.abs(n) < 0.005 ? "no change" : `${n > 0 ? "+" : "&minus;"}${cad.format(Math.abs(n))}`);
  const rows = [
    ...c.items.map((it) => `<tr>${cell(esc(changeLine(it)))}${cell("", true)}</tr>`),
    `<tr>${cell("Change, before HST", false, true)}${cell(signed(c.difference), true, true)}</tr>`,
    `<tr>${cell(`Total was ${cad.format(c.before.total)}, now`)}${cell(cad.format(o.totals.total), true, true)}</tr>`,
    // What has been paid and what is left (2026-10-31), when the payments could be read.
    ...(paidLeft(c, o.totals.total)
      ? [`<tr>${cell("Paid so far")}${cell(cad.format(paidLeft(c, o.totals.total)!.paid), true)}</tr>`, `<tr>${cell("Left to pay", false, true)}${cell(cad.format(paidLeft(c, o.totals.total)!.left), true, true)}</tr>`]
      : []),
  ].join("");
  const stages = stagesOf(o)
    .map((s, i) => `<tr>${cell(`${esc(s.label)}${stageNote(s) ? `<br><span style="font-size:13px;font-weight:400;color:${C.muted};">${esc(stageNote(s))}</span>` : ""}`)}${cell(s.amount !== null ? `${c.before.stages[i]?.amount != null && Math.abs((c.before.stages[i].amount ?? 0) - s.amount) > 0.004 ? `<span style="color:${C.muted};text-decoration:line-through;">${cad.format(c.before.stages[i].amount!)}</span> ` : ""}${cad.format(s.amount)}` : "", true)}</tr>`)
    .join("");
  const signoff = sender?.firstName ? `${esc(sender.firstName)} &middot; ${esc(copy.company.name)}` : `The ${esc(copy.company.name)} team`;
  const body =
    row(
      eyebrow(`Updated quote &middot; change ${c.no}`) +
        `<p style="margin:-2px 0 14px;font-family:${SANS};font-size:12px;color:${C.muted};letter-spacing:.04em;">${esc(copy.quoteNumber)} &middot; ${esc(longDate(copy.sentOn))}</p>` +
        `<h1 class="h1" style="margin:0 0 16px;font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.2;color:${C.ink};">${hi ? `Hi ${esc(hi)}, here` : "Here"} is your updated quote.</h1>` +
        para(`As we discussed, here is what changed since ${esc(longDate(c.sinceOn))}. This is the record of the change; the full updated quote is on the page.`),
      "40px 40px 20px",
    ) +
    row(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.wash};border-radius:18px;"><tr><td style="padding:8px;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border:1px solid ${C.hair};border-radius:12px;"><tr><td style="padding:20px 24px;">` +
        `<p style="margin:0 0 6px;font-family:${SERIF};font-size:20px;color:${C.ink};">What changed</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>` +
        `</td></tr></table></td></tr></table>`,
      "0 40px 16px",
    ) +
    row(button("View your updated quote", to.link), "12px 40px 10px") +
    hairline() +
    row(eyebrow("Your payment schedule") + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stages}</table>` + para("The payment schedule is worked out on the new total; what you&rsquo;ve already paid counts toward it.", 13, C.muted, "10px 0 0")) +
    hairline("22px 40px 28px") +
    row(para("If anything here isn&rsquo;t what we agreed, reply to this email.", 15, C.body, "0 0 4px") + para(signoff, 14, C.muted, "0 0 36px"));
  const from = "emailFrom" in options ? options.emailFrom : emailFromFor(sender, copy.company.email, true);
  // Never an attachment (2026-10-27): the updated quote is on its page.
  return { type: "Email", contactId: to.contactId, subject, html: frame(copy, subject, preheader, body), ...(from ? { emailFrom: from } : {}) };
}

/** The text for a change: who, the new total, the link. GSM-7. */
export function changeSmsMessage(copy: CustomerCopy, to: { contactId: string; firstName: string | null; link: string }, sender: Sender | null = null): GhlMessage {
  const c = copy.change!;
  const hi = greetingName(to.firstName);
  const whoFrom = sender?.firstName ? `it's ${sender.firstName} from ${copy.company.name}` : `it's ${copy.company.name}`;
  const total = cad.format(copy.options[0].totals.total);
  return {
    type: "SMS",
    contactId: to.contactId,
    message: `${hi ? `Hi ${hi}, ${whoFrom}.` : `Hi, ${whoFrom}.`} As we discussed, here is your updated quote ${copy.quoteNumber} (change ${c.no}). The new total is ${total}${copy.options[0].totals.hst ? " with HST" : ""}; the payments follow the new total, and what you've paid counts toward it.${paidLeft(c, copy.options[0].totals.total) ? ` Paid so far ${cad.format(paidLeft(c, copy.options[0].totals.total)!.paid)}, left to pay ${cad.format(paidLeft(c, copy.options[0].totals.total)!.left)}.` : ""}\n\nSee what changed:\n${to.link}\n\nIf anything isn't what we agreed, just reply.`,
  };
}

/* ---------- send again (Albert, 2026-10-30) ---------- */

/**
 * Sending a quote's link again (Albert, 2026-10-30: "after sending a quote link WITHOUT a PDF, the client
 * requests for it. Can there be a send PDF button. Or a re-send quote?"). Same version, same link, same frozen
 * copy: nothing about the quote changes, it is not a new send (no status, date, follow-up tag or supersede).
 * `pdf` turns on Download PDF on their page, if it was off, and puts the PDF's link in the message. Still
 * never an attachment (2026-10-27): the link is the PDF.
 */
export type ResendInput = { channels: Channels; pdf: boolean };

export function parseResend(raw: unknown): ResendInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ch = (r.channels ?? {}) as Record<string, unknown>;
  return { channels: { email: ch.email === true, sms: ch.sms === true }, pdf: r.pdf === true };
}

const RESENDABLE = ["Sent", "Accepted", "Won"];

/** Why it can't go again: a version still out with the customer, or one they accepted, by a channel the contact has. */
export function resendProblems(v: { status: string | null; validUntil: string | null }, input: ResendInput, to: { email: string | null; phone: string | null }, today: string): string[] {
  const out: string[] = [];
  // An accepted or won quote goes again too (2026-10-30), with its signed PDF; its good-until date no longer matters.
  if (!RESENDABLE.includes(v.status ?? "")) out.push("Only a quote that is out with the customer, accepted or won can be sent again.");
  else if (v.status === "Sent" && v.validUntil && today > v.validUntil) out.push("This quote's good-until date has passed, so its link no longer offers it. Send a new version instead.");
  if (!input.channels.email && !input.channels.sms) out.push("Choose email, text or both.");
  if (input.channels.email && !to.email) out.push("The GHL contact has no email.");
  if (input.channels.sms && !to.phone) out.push("The GHL contact has no phone number.");
  return out;
}

/** The email: the PDF's link when asked for, and the quote's own link either way. */
export function resendEmailMessage(
  copy: CustomerCopy,
  to: { contactId: string; firstName: string | null; link: string; pdfUrl: string | null; accepted?: boolean },
  sender: Sender | null = null,
  options: { emailFrom?: string | null } = {},
): GhlMessage {
  const hi = greetingName(to.firstName);
  const what = to.accepted ? "accepted quote" : "quote";
  const subject = to.pdfUrl ? `Your ${what} ${copy.quoteNumber} as a PDF` : `Your ${what} ${copy.quoteNumber} from ${copy.company.name}`;
  const preheader = to.pdfUrl ? "Here is the PDF you asked for." : "Here is the link to your quote again.";
  const signoff = sender?.firstName ? `${esc(sender.firstName)} &middot; ${esc(copy.company.name)}` : `The ${esc(copy.company.name)} team`;
  const head = to.pdfUrl ? `here is your ${what} as a PDF.` : `here is your ${what} again.`;
  const body =
    row(
      eyebrow(esc(copy.quoteNumber)) +
        `<h1 class="h1" style="margin:0 0 16px;font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.2;color:${C.ink};">${hi ? `Hi ${esc(hi)}, ${head}` : head.charAt(0).toUpperCase() + head.slice(1)}</h1>` +
        para(to.pdfUrl ? (to.accepted ? "Download the signed copy below. Your accepted quote is also online at the same link as before." : "Download it below. The full quote is still online at the same link as before.") : "It&rsquo;s the same quote we sent before, at the same link."),
      "40px 40px 12px",
    ) +
    (to.pdfUrl ? row(button("Download the PDF", to.pdfUrl), "8px 40px 12px") + row(button("View your quote online", to.link, false), "4px 40px 10px") : row(button("View your quote", to.link), "8px 40px 10px")) +
    hairline("22px 40px 28px") +
    row(para("Any questions, just reply to this email.", 15, C.body, "0 0 4px") + para(signoff, 14, C.muted, "0 0 36px"));
  const from = "emailFrom" in options ? options.emailFrom : emailFromFor(sender, copy.company.email, true);
  return { type: "Email", contactId: to.contactId, subject, html: frame(copy, subject, preheader, body), ...(from ? { emailFrom: from } : {}) };
}

/** The text: who, the PDF's link on its own line when asked for, then the quote's. GSM-7. */
export function resendSmsMessage(copy: CustomerCopy, to: { contactId: string; firstName: string | null; link: string; pdfUrl: string | null; accepted?: boolean }, sender: Sender | null = null): GhlMessage {
  const what = to.accepted ? "accepted quote" : "quote";
  const hi = greetingName(to.firstName);
  const whoFrom = sender?.firstName ? `it's ${sender.firstName} from ${copy.company.name}` : `it's ${copy.company.name}`;
  const first = hi ? `Hi ${hi}, ${whoFrom}.` : `Hi, ${whoFrom}.`;
  const message = to.pdfUrl
    ? `${first} Here is the PDF of your ${what} ${copy.quoteNumber}:\n${to.pdfUrl}\n\nThe full quote is still here:\n${to.link}\n\nAny questions, just reply.`
    : `${first} Here is the link to your ${what} ${copy.quoteNumber} again:\n${to.link}\n\nAny questions, just reply.`;
  return { type: "SMS", contactId: to.contactId, message };
}

/* ---------- the invoice or receipt (Albert, 2026-10-30) ---------- */

/**
 * The email carrying a won project's invoice or receipt: the total, what has been paid, what is left, and the
 * PDF **attached** (Albert, 2026-10-30: an invoice is a document customers file), with its link as well. The
 * second email allowed an attachment, after the acceptance email.
 */
export function billingEmailMessage(
  copy: CustomerCopy,
  doc: { title: "Invoice" | "Receipt"; number: string; total: number; paid: number; balance: number; credit: number },
  to: { contactId: string; firstName: string | null; pdfUrl: string },
  sender: Sender | null = null,
  options: { emailFrom?: string | null } = {},
): GhlMessage {
  const hi = greetingName(to.firstName);
  const word = doc.title.toLowerCase();
  const subject = `Your ${word} ${doc.number} from ${copy.company.name} (${copy.quoteNumber})`;
  const left = doc.credit > 0 ? `a credit of ${cad.format(doc.credit)}` : doc.balance > 0 ? `${cad.format(doc.balance)} left to pay` : "paid in full";
  const preheader = `Total ${cad.format(doc.total)}, paid ${cad.format(doc.paid)}, ${left}.`;
  const cell = (t: string, right = false, strong = false) =>
    `<td${right ? ' align="right"' : ""} style="padding:9px 0;border-bottom:1px solid ${C.hair};font-family:${SANS};font-size:15px;color:${strong ? C.ink : C.body};${strong ? "font-weight:600;" : ""}${right ? "white-space:nowrap;" : ""}">${t}</td>`;
  const rows = [
    `<tr>${cell("Total")}${cell(cad.format(doc.total), true)}</tr>`,
    `<tr>${cell("Paid so far")}${cell(cad.format(doc.paid), true)}</tr>`,
    `<tr>${cell(doc.credit > 0 ? "Credit" : doc.balance > 0 ? "Balance owing" : "Paid in full", false, true)}${cell(cad.format(doc.credit > 0 ? doc.credit : doc.balance), true, true)}</tr>`,
  ].join("");
  const signoff = sender?.firstName ? `${esc(sender.firstName)} &middot; ${esc(copy.company.name)}` : `The ${esc(copy.company.name)} team`;
  const body =
    row(
      eyebrow(`${esc(doc.title)} &middot; ${esc(doc.number)}`) +
        `<h1 class="h1" style="margin:0 0 16px;font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.2;color:${C.ink};">${hi ? `Hi ${esc(hi)}, here` : "Here"} is your ${word}.</h1>` +
        para(`For your project, quote ${esc(copy.quoteNumber)}. It&rsquo;s attached as a PDF, with every payment we&rsquo;ve received so far.`),
      "40px 40px 16px",
    ) +
    row(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.wash};border-radius:18px;"><tr><td style="padding:8px;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border:1px solid ${C.hair};border-radius:12px;"><tr><td style="padding:20px 24px;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table></td></tr></table>`,
      "0 40px 16px",
    ) +
    row(button(`Download your ${word}`, to.pdfUrl), "12px 40px 10px") +
    hairline("22px 40px 28px") +
    row(para("Any questions, just reply to this email.", 15, C.body, "0 0 4px") + para(signoff, 14, C.muted, "0 0 36px"));
  const from = "emailFrom" in options ? options.emailFrom : emailFromFor(sender, copy.company.email, true);
  return { type: "Email", contactId: to.contactId, subject, html: frame(copy, subject, preheader, body), attachments: [to.pdfUrl], ...(from ? { emailFrom: from } : {}) };
}

/* ---------- the link ---------- */

const TOKEN = /^[A-Za-z0-9]{32}$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const isToken = (s: unknown): s is string => typeof s === "string" && TOKEN.test(s);

/** 32 characters from a 62-letter alphabet: about 190 bits, never guessable. */
export function newToken(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let out = "";
  while (out.length < 32) {
    for (const b of random(48)) {
      if (b < 248 && out.length < 32) out += ALPHABET[b % 62]; // 248 = 4 × 62: no bias
    }
  }
  return out;
}

/** The customer's link and the PDF's, on the public deployment's address. */
export function customerLinks(base: string, token: string, file: string): { link: string; pdfUrl: string } {
  const root = base.replace(/\/+$/, "");
  return { link: `${root}/c/${token}`, pdfUrl: `${root}/c/${token}/${file}` };
}
