/**
 * The terms a customer agrees to when accepting (Albert, 2026-10-27: "Project Expectations is it").
 * The PDF ships with the app in public/docs/, one file per version and never replaced, so what a
 * customer agreed to can always be opened again; each acceptance records the version it was shown.
 *
 * Null until the reworded v2.2 is exported from the Word doc and added (v2.1's section 5 says a
 * change agreed by phone is not valid, which the change flow contradicts). While it is null the
 * Accept button is not shown and an acceptance is refused: online acceptance is off.
 */
export type Terms = { version: string; title: string; file: string };

export const TERMS: Terms | null = null;

/** Each version's file: public/docs/project-expectations-v2.2.pdf. Never replaced, so an old acceptance's link still opens what was agreed. */
export const termsFile = (version: string) => `project-expectations-v${version.replace(/[^0-9.]/g, "")}.pdf`;

/** Where the PDF is served, on both deployments (the proxy lets /docs/ through without a sign-in). */
export const termsHref = (t: Pick<Terms, "version">) => `/docs/${termsFile(t.version)}`;
