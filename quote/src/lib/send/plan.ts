import { optionTotals, parityDiffs } from "@/lib/calc";
import type { Quote } from "@/lib/quotes/types";
import { addDays, isIsoDate, longDate, type CustomerCopy } from "./copy";

/**
 * Sending a quote (milestone 4, Albert 2026-10-15): the checks before anything leaves, and the
 * exact GHL message bodies Make forwards. Pure and tested (tests/send.test.ts); the server side
 * that carries it out is src/lib/quotes/send.ts.
 *
 * Email and text both go through GHL, so they land in the customer's conversation, from the
 * location's own email and number. The email carries the link and the PDF; the text, the link.
 */

export type Channels = { email: boolean; sms: boolean };

export type SendInput = {
  /** What the person sending saw (fingerprint of the version when the page opened). */
  base: string;
  validUntil: string;
  channels: Channels;
};

/** Everything that stops a send. Empty means it may go. Each line is said to staff as is. */
export function sendProblems(quote: Quote, input: SendInput, ctx: { today: string; fingerprint: string }): string[] {
  const out: string[] = [];
  if (quote.status !== "Draft") out.push(`This version is ${quote.status ?? "not a draft"}. Only a draft is sent; save a new version to send changes.`);
  if (ctx.fingerprint !== input.base) out.push("This version changed since the page opened. Reload it and check it before sending.");
  if (!quote.link?.ghlContactId) out.push("This quote has no GHL contact, so there is nobody to send it to.");
  if (!quote.link?.quoteNumber) out.push("This quote has no quote number yet.");
  if (quote.sendBlock) out.push(quote.sendBlock);
  if (quote.legacyLineCount > 0) out.push("Some lines are in the old A/B/C format and on no option. Move them onto an option first.");
  if (quote.options.length === 0) out.push("This version has no options.");
  for (const o of quote.options) {
    const t = optionTotals(o.lines, quote.discountRate, quote.showHst);
    if (t.total <= 0) out.push(`${o.name} has nothing priced in it.`);
    else if (parityDiffs(t, o.airtable).length > 0) out.push(`The app and Airtable disagree on ${o.name}. Fix that before sending.`);
  }
  if (!isIsoDate(input.validUntil)) out.push("Choose the date the quote is good until.");
  else if (input.validUntil < ctx.today) out.push("The valid-until date is in the past.");
  else if (input.validUntil > addDays(ctx.today, 365)) out.push("The valid-until date is more than a year away.");
  if (!input.channels.email && !input.channels.sms) out.push("Choose email, text, or both.");
  if (input.channels.email && !quote.link?.email) out.push("GHL has no email for this customer.");
  if (input.channels.sms && !quote.link?.phone) out.push("GHL has no phone number for this customer.");
  return out;
}

/* ---------- the messages ---------- */

export type GhlMessage =
  | { type: "Email"; contactId: string; subject: string; html: string; attachments: string[] }
  | { type: "SMS"; contactId: string; message: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

/** "Jane" for the greeting; never a surname alone, never a guess. */
export function greetingName(first: string | null | undefined): string | null {
  const f = (first ?? "").trim().split(/\s+/)[0];
  return f && /^[\p{L}][\p{L}'’-]*$/u.test(f) ? f : null;
}

export function emailMessage(copy: CustomerCopy, to: { contactId: string; firstName: string | null; link: string; pdfUrl: string }): GhlMessage {
  const hi = greetingName(to.firstName);
  const prelim = copy.basis === "Preliminary";
  const several = copy.options.length > 1;
  const rows = copy.options
    .map(
      (o) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e4e8ee">${esc(o.name)}${o.recommended && several ? ' <span style="color:#1e6fff;font-size:12px">· Recommended</span>' : ""}</td>` +
        `<td style="padding:8px 0;border-bottom:1px solid #e4e8ee;text-align:right;white-space:nowrap"><b>${cad.format(o.totals.total)}</b></td></tr>`,
    )
    .join("");
  const html = [
    `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#26303c;max-width:560px">`,
    `<p>${hi ? `Hi ${esc(hi)},` : "Hello,"}</p>`,
    `<p>Thank you for considering Titan Flooring. Your ${prelim ? "preliminary " : ""}quote ${esc(copy.quoteNumber)} is ready${several ? `, with ${copy.options.length} options to compare` : ""}.</p>`,
    `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px">${rows}</table>`,
    `<p style="margin:20px 0"><a href="${esc(to.link)}" style="background:#1e6fff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;display:inline-block">View your quote</a></p>`,
    `<p style="color:#66717f;font-size:13px">${copy.showHst ? "Totals include HST. " : ""}The quote is good until ${esc(longDate(copy.validUntil))}. A PDF copy is attached.${prelim ? " This is a preliminary estimate; we confirm the final price once we have measured." : ""}</p>`,
    `<p>If you have any questions, just reply to this email.</p>`,
    `<p>The Titan Flooring team</p>`,
    `</div>`,
  ].join("");
  return {
    type: "Email",
    contactId: to.contactId,
    subject: `Your Titan Flooring quote ${copy.quoteNumber}`,
    html,
    attachments: [to.pdfUrl],
  };
}

export function smsMessage(copy: CustomerCopy, to: { contactId: string; firstName: string | null; link: string }): GhlMessage {
  const hi = greetingName(to.firstName);
  return {
    type: "SMS",
    contactId: to.contactId,
    message:
      `${hi ? `Hi ${hi}, y` : "Y"}our Titan Flooring ${copy.basis === "Preliminary" ? "preliminary " : ""}quote ${copy.quoteNumber} is ready: ${to.link}\n` +
      `It's good until ${longDate(copy.validUntil)}. Any questions, just reply here.`,
  };
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
