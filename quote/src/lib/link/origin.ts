/**
 * Where a customer found us (Albert, 2026-10-27), picked on a preliminary's customer step. The pick
 * is the most trusted answer: it goes into the GHL contact's Quote Origin custom field, the contact's
 * Source and the opportunity's Source, replacing whatever is there, unless that field already holds
 * one of these exact options, which is kept as is. Pure; tested in tests/ghlRequest.test.ts and
 * tests/link.test.ts.
 */
export const ORIGINS = [
  "Direct: Walk-in",
  "Direct: Phone",
  "Direct: Email",
  "Social: Instagram DM",
  "Social: Facebook Message",
  "Web: Website Form",
  "Web: Google Business",
  "Referral: Customer",
  "Referral: Trade",
  "Repeat Customer",
  "Google Ad",
  "Meta Ad",
  "Other",
] as const;

export type Origin = (typeof ORIGINS)[number];

export const isOrigin = (v: unknown): v is Origin => typeof v === "string" && (ORIGINS as readonly string[]).includes(v);

/** A field the pick may replace: anything but one of the exact options (blank, a GHL default, a typo). */
export const replaceable = (current: string | null | undefined): boolean => !isOrigin(current?.trim());
