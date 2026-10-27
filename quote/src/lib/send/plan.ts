import { optionTotals, parityDiffs } from "@/lib/calc";
import type { Quote } from "@/lib/quotes/types";
import { addDays, dollars, hstRow, isIsoDate, isRange, leadPrice, longDate, rangeText, rangeWhy, type CopyOption, type CustomerCopy } from "./copy";
import { copyKind, flooringSummary, kindPhrase } from "./summary";

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
  if (!ids) return quote;
  const keep = new Set(ids);
  return { ...quote, options: quote.options.filter((o) => keep.has(o.id)) };
}

/** "options 1 and 3" for the edit log, numbered as the editor shows them; null when every option went. */
export function chosenWords(quote: Pick<Quote, "options">, ids: string[] | null | undefined): string | null {
  if (!ids || quote.options.every((o) => ids.includes(o.id))) return null;
  const nums = quote.options.flatMap((o, i) => (ids.includes(o.id) ? [String(i + 1)] : []));
  return nums.length === 1 ? `option ${nums[0]} only` : `options ${nums.slice(0, -1).join(", ")} and ${nums.at(-1)}`;
}

/** What stops one option going to the customer, or null. */
export function optionProblem(quote: Pick<Quote, "discountRate" | "showHst">, o: Quote["options"][number]): string | null {
  const t = optionTotals(o.lines, quote.discountRate, quote.showHst);
  if (t.total <= 0) return `${o.name} has nothing priced in it.`;
  if (parityDiffs(t, o.airtable).length > 0) return `The app and Airtable disagree on ${o.name}. Fix that before sending.`;
  return null;
}

/**
 * Everything that stops a send. Empty means it may go. Each line is said to staff as is.
 * `skipOptions`: leave out the per-option checks, for the Send card, which applies optionProblem() to
 * whatever is ticked as the sender changes it. The send itself always runs every check.
 */
export function sendProblems(quote: Quote, input: SendInput, ctx: { today: string; fingerprint: string; skipOptions?: boolean }): string[] {
  const out: string[] = [];
  if (quote.status !== "Draft") out.push(`This version is ${quote.status ?? "not a draft"}. Only a draft is sent; save a new version to send changes.`);
  if (ctx.fingerprint !== input.base) out.push("This version changed since the page opened. Reload it and check it before sending.");
  if (!quote.link?.ghlContactId) out.push("This quote has no GHL contact, so there is nobody to send it to.");
  if (!quote.link?.quoteNumber) out.push("This quote has no quote number yet.");
  if (quote.sendBlock) out.push(quote.sendBlock);
  if (quote.legacyLineCount > 0) out.push("Some lines are in the old A/B/C format and on no option. Move them onto an option first.");
  if (quote.options.length === 0) out.push("This version has no options.");
  const ids = input.optionIds ?? null;
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
  // A preliminary carries no good-until date (Albert, 2026-10-22); any date sent with one is ignored.
  if (quote.basis !== "Preliminary") {
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
  | { type: "Email"; contactId: string; subject: string; html: string; attachments?: string[]; emailFrom?: string }
  | { type: "SMS"; contactId: string; message: string };

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

/** One option as a card in a cream tray: its name, what it includes with quantities, and the total set large. */
function optionCard(o: CopyOption, copy: CustomerCopy, several: boolean): string {
  const items: string[] = [];
  const cell = (text: string, right = false) =>
    `<td${right ? ' align="right"' : ""} style="padding:11px 0;border-bottom:1px solid ${C.hair};font-family:${SANS};font-size:${right ? 14 : 15}px;color:${right ? C.muted : C.body};${right ? "white-space:nowrap;" : ""}">${text}</td>`;
  for (const line of flooringSummary(o)) {
    const [label, rest] = line.split(/:\s(.*)/s);
    if (!rest) continue;
    if (/^Total /.test(label)) continue;
    // "Carpet removal · 200 sq ft; Tile removal · 50 sq ft" → one row per item, quantity on the right.
    for (const item of rest.split("; ")) {
      const [what, qty] = item.split(" · ");
      // "Removal · Remove existing laminate" says it twice: when the line already opens with the work, show it alone.
      const stem = label.toLowerCase().replace(/al$/, "");
      // Rate Card names carry their own section ("Refinish | SAND - Hardwood"), so they never take a prefix (2026-10-24).
      const dup = what.includes(" | ") || what.toLowerCase().startsWith(stem) || (label === "Subfloor prep" && /^subfloor/i.test(what));
      const amount = qty ? esc(qty.replace(/^\d+(?:\.\d+)?/, (n) => Number(n).toLocaleString("en-CA"))) : "included";
      items.push(`<tr>${cell(dup ? esc(what) : `${esc(label)} &middot; ${esc(what)}`)}${cell(amount, true)}</tr>`);
    }
  }
  const stairs = o.sections.find((s) => s.name === "Stairs");
  const UNIT: Record<string, string> = { sqft: "sq ft", "linear ft": "lin ft", piece: "pcs", each: "each" };
  for (const l of stairs?.lines ?? []) {
    if (l.kind !== "item" || l.optional) continue;
    const unit = l.uom ? UNIT[l.uom] : undefined;
    items.push(`<tr>${cell(`Stairs &middot; ${esc(l.description)}`)}${cell(unit && l.qty ? `${esc(String(l.qty))} ${unit}` : "included", true)}</tr>`);
  }
  for (const raw of (o.description ?? "").split("\n")) {
    const t = raw.trim();
    if (t.startsWith("* ")) items.push(`<tr>${cell(esc(t.slice(2)))}${cell("", true)}</tr>`);
  }
  if (copy.timing) items.push(`<tr>${cell("Timing")}${cell(esc(copy.timing), true)}</tr>`);
  const prelim = copy.basis === "Preliminary";
  const badge = o.recommended && several ? `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${C.cream};font-family:${SANS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.accentDeep};font-weight:600;">Recommended</span>` : "";
  const title = several ? esc(o.name) : prelim ? "What&rsquo;s included" : "Your quote";
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
    `<td style="font-family:${SERIF};font-size:20px;color:${C.ink};">${title}</td>${badge ? `<td align="right">${badge}</td>` : ""}</tr></table></td></tr>` +
    (items.length ? `<tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items.join("")}</table></td></tr>` : "") +
    `<tr><td style="padding:18px 24px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `${figure}${breakdown}</table></td></tr></table></td></tr></table>`
  );
}

/** Three or more options (2026-10-24): one card listing each option's name and its price before HST. */
function optionList(copy: CustomerCopy): string {
  const prelim = copy.basis === "Preliminary";
  const rows = copy.options
    .map((o, i) => {
      const lead = leadPrice(copy, o.totals);
      const price = o.range ? `${dollars(o.range.low)} &ndash; ${dollars(o.range.high)}` : cad.format(lead.amount);
      const badge = o.recommended
        ? ` <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background:${C.cream};font-family:${SANS};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.accentDeep};font-weight:600;vertical-align:2px;">Recommended</span>`
        : "";
      return (
        `<tr><td style="padding:13px 0;border-bottom:1px solid ${C.hair};font-family:${SANS};font-size:15px;color:${C.ink};">` +
        `<span style="color:${C.muted};font-size:13px;">Option ${i + 1}</span><br>${esc(o.name)}${badge}</td>` +
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
    `<tr><td style="padding:14px 24px 20px;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">${isRange(copy) ? "Estimated ranges. " : prelim ? "Rough prices. " : ""}What each option includes, the HST and the payment schedule are on the quote page.</td></tr>` +
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
    co.hstNumber ? `HST # ${esc(co.hstNumber)}` : "",
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

/** The payment schedule in words, from the frozen totals (35 / 35 / balance, calc.ts PAYMENT_SPLIT). */
function paymentWords(o: CopyOption): string {
  const pct = (part: number) => `${Math.round((part / o.totals.total) * 100)}%`;
  return `${pct(o.totals.payment1)} to reserve your dates, ${pct(o.totals.payment2)} when the crew starts, and the balance on completion. No payment is due until you choose a start date.`;
}

export function emailMessage(
  copy: CustomerCopy,
  to: { contactId: string; firstName: string | null; link: string; pdfUrl: string },
  sender: Sender | null = null,
  options: { emailFrom?: string | null; booking?: { inStore: string; inHome: string } | null; visited?: boolean; attachPdf?: boolean } = {},
): GhlMessage {
  const hi = greetingName(to.firstName);
  const prelim = copy.basis === "Preliminary";
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
  const preheader = several
    ? `${copy.options.length} options from ${ranged ? dollars(lowEnd) : cad.format(lowEnd)} ${low.tag}${copy.validUntil ? ` · good until ${longDate(copy.validUntil)}` : ""}`
    : r0
      ? `Estimated range ${rangeText(r0.low, r0.high)} ${leads[0].tag}`
      : `${prelim ? "Rough total" : "Total"} ${cad.format(leads[0].amount)} ${leads[0].tag}${copy.validUntil ? ` · good until ${longDate(copy.validUntil)}` : ""}`;

  const headline = `${hi ? `Hi ${esc(hi)}, your` : "Your"} ${esc(what === "quote" ? "" : what).trim()} ${noun} is ready.`.replace(/\s+/g, " ");
  // A preliminary can go out before anyone has been to the house (Albert, 2026-10-24), so the generic
  // opening is the default; the sender ticks "we've been to the home" for the warmer one.
  // Since 2026-10-27 a preliminary is a range: the same opening, a range instead of "a rough number", and what can move it.
  const intro = prelim && ranged
    ? options.visited
      ? `Thanks for having us over. Here is a price range for what we talked about, based on what we saw. ${esc(rangeWhy(copy))} Once you&rsquo;ve picked a material and we&rsquo;ve measured, we confirm the final price.`
      : `Thanks for telling us about your project. Here is a price range based on what you&rsquo;ve described. ${esc(rangeWhy(copy))} Once you&rsquo;ve picked a material and we&rsquo;ve measured, we confirm the final price.`
    : prelim
    ? options.visited
      ? `Thanks for having us over. Here is the rough number we talked about, based on what we saw. Once you&rsquo;ve picked a material and we&rsquo;ve measured, we confirm the final price.`
      : `Thanks for telling us about your project. Here is a rough number based on what you&rsquo;ve described. Once you&rsquo;ve picked a material and we&rsquo;ve measured, we confirm the final price.`
    : several
      ? `${copy.options.length} ways to do the work, side by side. Open the quote to see every detail and the payment schedule.`
      : `Everything we talked about is in the quote, with the payment schedule. Open it to see the detail.`;

  // One or two options: a full card each. Three or more (2026-10-24): one compact list of names and prices,
  // the detail on the quote page, so the email stays short however many options went.
  const compact = copy.options.length >= 3;
  const cards = compact ? row(optionList(copy), "0 40px 16px") : copy.options.map((o) => row(optionCard(o, copy, several), "0 40px 16px")).join("");
  // No PDF attached by default (Albert, 2026-10-24): an attachment is a copy we can never see opened, while the
  // quote page's Download PDF is. The sender ticks Attach PDF for a client who needs the file in their inbox.
  const under = [
    options.attachPdf ? "A PDF copy is attached." : "You can download a PDF from the quote page.",
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
      eyebrow(prelim ? "Preliminary estimate" : `Quote${copy.version !== null ? ` &middot; version ${copy.version}` : ""}`) +
        `<p style="margin:-2px 0 14px;font-family:${SANS};font-size:12px;color:${C.muted};letter-spacing:.04em;">${esc(copy.quoteNumber)} &middot; ${esc(longDate(copy.sentOn))}</p>` +
        `<h1 class="h1" style="margin:0 0 16px;font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.2;color:${C.ink};letter-spacing:-.01em;">${headline}</h1>` +
        para(intro),
      "40px 40px 24px",
    ) +
    cards +
    row(button(several ? `View and compare your ${noun}` : `View your ${noun}`, to.link), "12px 40px 10px") +
    row(para(under, 13, C.muted, "0", "text-align:center;"), "0 40px 8px") +
    (prelim ? "" : hairline() + row(eyebrow("How payment works") + para(esc(paymentWords(copy.options[0])), 15, C.body, "0 0 6px"))) +
    hairline(prelim ? "28px 40px" : "22px 40px 28px") +
    row(eyebrow("What happens next") + steps(next), "0 40px 6px") +
    (prelim && options.booking ? row(button("Book an in-store visit", options.booking.inStore, false), "0 40px 30px") : "") +
    hairline("0 40px 28px") +
    row(para(`Questions? Reply to this email${phone}.${ask}`, 15, C.body, "0 0 4px") + para(signoff, 14, C.muted, "0 0 36px"));

  // An explicit `emailFrom` wins, null included (the send's retries pass the bare address, then none).
  const from = "emailFrom" in options ? options.emailFrom : emailFromFor(sender, copy.company.email, true);
  return {
    type: "Email",
    contactId: to.contactId,
    subject,
    html: frame(copy, subject, preheader, body),
    ...(options.attachPdf ? { attachments: [to.pdfUrl] } : {}),
    ...(from ? { emailFrom: from } : {}),
  };
}

/**
 * The text (2026-10-22): who is texting, the one number they care about, the link on its own
 * line, how to reply. Straight apostrophes on purpose: one curly quote or emoji switches the
 * whole message to UCS-2 and halves each segment.
 */
export function smsMessage(copy: CustomerCopy, to: { contactId: string; firstName: string | null; link: string }, sender: Sender | null = null, options: { visited?: boolean } = {}): GhlMessage {
  const hi = greetingName(to.firstName);
  const prelim = copy.basis === "Preliminary";
  const several = copy.options.length > 1;
  const kind = kindPhrase(copyKind(copy), false).replace(/ quote$/, "");
  const whoFrom = sender?.firstName ? `it's ${sender.firstName} from ${copy.company.name}` : `it's ${copy.company.name}`;
  // Every amount before HST, "+ HST" after it (2026-10-24); with several options, the lowest.
  const leads = copy.options.map((o) => leadPrice(copy, o.totals));
  const low = leads.reduce((a, b) => (b.amount < a.amount ? b : a));
  const money = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString("en-CA")}` : cad.format(n));
  const first = hi ? `Hi ${hi}, ${whoFrom}.` : `Hi, ${whoFrom}.`;
  // Layout (Albert, 2026-10-24): the news, a blank line, "See the full details here:" with the link on
  // its own line, a blank line, how to reply. No phone number: the reply goes to the same thread.
  const r0 = copy.options[0].range;
  const what = prelim
    ? r0
      ? // A range (2026-10-27), with " to ": an en dash is not GSM-7.
        `${options.visited ? "Thanks for having us over." : "Thanks for telling us about your project."} Your ${kind === "quote" ? "" : `${kind} `}estimate is ${rangeText(r0.low, r0.high, " to ")} ${leads[0].tag}.`
      : `${options.visited ? "Thanks for having us over." : "Thanks for telling us about your project."} Your rough ${kind === "quote" ? "" : `${kind} `}estimate is ${money(leads[0].amount)} ${leads[0].tag}.`
    : several
      ? `${copy.options.length} options for your ${kind === "quote" ? "project" : kind} are ready to compare, from ${money(low.amount)} ${low.tag}${copy.validUntil ? `, good until ${shortDate(copy.validUntil)}` : ""}.`
      : `Your ${kind === "quote" ? "" : `${kind} `}quote is ready, ${money(leads[0].amount)} ${leads[0].tag}${copy.validUntil ? `, good until ${shortDate(copy.validUntil)}` : ""}.`;
  const close = prelim
    ? r0
      ? "The final price should land in that range. Any questions, just reply."
      : "We confirm the price once we've measured. Any questions, just reply."
    : several
      ? "Reply here with the one you'd like, or with any questions."
      : "Reply here if anything needs changing.";
  return { type: "SMS", contactId: to.contactId, message: `${first} ${what}\n\nSee the full details here:\n${to.link}\n\n${close}` };
}

/** "Nov 21" for a text. */
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" });
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
