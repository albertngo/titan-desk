/**
 * Where a customer found us (Albert, 2026-10-27), picked on a preliminary's customer step. It fills
 * the GHL contact's Quote Origin custom field and its Source, each only when blank (the app never
 * overwrites what GHL already knows). Pure; tested in tests/ghlRequest.test.ts and tests/link.test.ts.
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
