/**
 * The terms a customer agrees to when accepting (Albert, 2026-10-27: "Project Expectations is it").
 * They come from his Word doc: Make saves each new version of it as a PDF on a row of Terms Versions
 * (Albert: "pull from the file every turn to create the PDF"), and the newest row is the one a
 * customer agrees to today. Rows are never edited, so each acceptance records the row it was shown
 * and can always open exactly that again. Read by src/lib/accept/live.ts; this file is pure.
 */
export type Terms = {
  /** The Terms Versions row. */
  id: string;
  /** YYYY-MM-DD the doc was last saved, in Toronto: how the customer sees which version it is. */
  on: string;
};

/** The file name the customer's link serves them at, on the customer deployment. */
export const TERMS_PDF = "Titan-Flooring-Project-Expectations.pdf";

/** Where a customer link serves the Project Expectations: the version it agreed to once accepted, else today's. */
export const termsHref = (token: string) => `/c/${token}/${TERMS_PDF}`;

/** "updated October 27, 2026". */
export function termsLabel(on: string): string {
  const d = new Date(`${on}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || Number.isNaN(d.getTime())) return "current version";
  return `updated ${d.toLocaleDateString("en-CA", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" })}`;
}

/** Airtable serves attachments from airtableusercontent.com; nothing else is ever fetched as the terms. */
export const isAirtableFile = (u: string) => /^https:\/\/([a-z0-9-]+\.)*airtableusercontent\.com\//.test(u);
