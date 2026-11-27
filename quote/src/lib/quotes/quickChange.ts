import "server-only";
import { optionHst, optionTotals, round2 } from "@/lib/calc";
import { requireQuoterPerson } from "@/lib/auth";
import { buildCatalogue, fromQuote, lineFromEntry, manualLine, type EditorLine, type EditorQuote } from "@/lib/editor/model";
import { coLineProblem, type CoLine } from "@/lib/change/quick";
import { fingerprint } from "./savePlan";
import { optionScope } from "./scope";
import { loadContract } from "./contract";
import { getQuote, getRateCard } from "./load";
import { makeChange, saveVersion } from "./save";

/**
 * +C/O, the quick change order (Albert, 2026-11-27; vault 05_decisions/2026-11-27-quote-change-order-label): a few lines
 * added to a won project from All quotes, without opening the editor. It goes the way a change always goes: Make a change
 * (the open change is reopened, else the next one is started from the contract as it stands, `makeChange()`), the lines
 * are added to it and it is saved as the editor saves (`saveVersion()`, same checks and refusals). It stays a Draft:
 * staff review it on the quote page and send it for the record there, as any change (Changes after acceptance).
 *
 * A line is a Rate Card row or Stair Item (priced from the card, the rate typed over it when it differs) or a typed line;
 * a credit is always a typed line at a negative price, so no minimum charge can turn it into a charge. Pure rules in
 * src/lib/change/quick.ts. Writes nothing itself: save.ts does.
 */

export type QuickChangeInput = { lines: CoLine[] };
export type QuickChangeResult = { ok: true; versionId: string; before: number | null; after: number; added: number } | { ok: false; message: string };

export async function quickChange(versionId: string, input: QuickChangeInput): Promise<QuickChangeResult> {
  await requireQuoterPerson();
  const lines = Array.isArray(input?.lines) ? input.lines.slice(0, 20) : [];
  if (lines.length === 0) return { ok: false, message: "Add at least one line." };
  for (const l of lines) {
    const bad = coLineProblem(l);
    if (bad) return { ok: false, message: bad };
  }
  const any = await getQuote(versionId);
  const contractId = any?.link?.contractVersionId;
  if (!any?.link || !contractId) return { ok: false, message: "This quote has no contract yet, so there is nothing to change." };

  // The change: reopened if one is open, else started from the contract as it stands.
  const made = await makeChange(contractId);
  if (!made.ok) return { ok: false, message: made.message };
  const change = await getQuote(made.versionId);
  if (!change) return { ok: false, message: "The change couldn't be read back." };
  if (change.status !== "Draft") return { ok: false, message: `The open change is ${change.status ?? "not a draft"}, so lines can't be added here. Open it on the quote page.` };

  const original = fromQuote(change);
  const offered = original.options.filter((o) => !o.notOffered);
  if (offered.length === 0) return { ok: false, message: "The change has no option to add lines to." };
  // Stairs lines go on the stairs option and everything else on the first other one, when the project has both.
  const target = (section: string) => (section === "Stairs" ? offered.find((o) => optionScope(o) === "Stairs") : offered.find((o) => optionScope(o) !== "Stairs")) ?? offered[0];
  const needsCard = lines.some((l) => !l.credit && l.entryKey);
  const entries = needsCard ? await getRateCard().then((c) => buildCatalogue(c.rates, c.stairs, c.materials ?? [])) : [];
  const built: { option: string; line: EditorLine }[] = [];
  for (const l of lines) {
    const entry = !l.credit && l.entryKey ? entries.find((e) => e.key === l.entryKey) : undefined;
    if (!l.credit && l.entryKey && !entry) return { ok: false, message: `"${l.description}" is no longer on the Rate Card. Type it as a line instead.` };
    const base = entry ? lineFromEntry(entry, l.section) : manualLine(l.section, l.description.trim());
    const rate = l.credit ? -Math.abs(l.rate) : l.rate;
    built.push({ option: target(l.section).id, line: {
      ...base,
      description: l.credit ? `Credit: ${l.description.trim()}` : entry && l.description.trim() ? l.description.trim() : base.description,
      qty: l.qty,
      uom: l.uom?.trim() || base.uom,
      // The card's price stays the snapshot; a different typed rate is an override, as in the editor. A typed line has no card.
      unitPrice: entry && base.unitPriceSnap !== null && round2(base.unitPriceSnap) === round2(rate) ? null : rate,
      waste: null,
    } });
  }
  const edited: EditorQuote = { ...original, options: original.options.map((o) => ({ ...o, lines: [...o.lines, ...built.filter((b) => b.option === o.id).map((b) => b.line)] })) };
  const saved = await saveVersion(change.id, edited, fingerprint(original));
  if (!saved.ok) return { ok: false, message: saved.message };

  const after = round2(edited.options.filter((o) => !o.notOffered).reduce((a, o) => a + optionTotals(o.lines, edited.discountRate, optionHst(edited, o)).total, 0));
  const contract = await loadContract(any.link.quoteRecordId).catch(() => null);
  return { ok: true, versionId: change.id, before: contract?.contract.totals.total ?? null, after, added: built.length };
}

/** For the +C/O card: the Rate Card rows and Stair Items to pick from, by name, with their unit and price. */
export type CoPick = { key: string; label: string; uom: string | null; rate: number | null; stairs: boolean };

export async function coPicks(): Promise<CoPick[]> {
  await requireQuoterPerson();
  const card = await getRateCard();
  return buildCatalogue(card.rates, card.stairs, card.materials ?? []).map((e) =>
    e.kind === "stair"
      ? { key: e.key, label: e.name, uom: e.unit ?? null, rate: e.rate, stairs: true }
      : { key: e.key, label: e.wording || `${e.labourType} | ${e.spec}`, uom: e.uom, rate: lineFromEntry(e, "Install").unitPriceSnap, stairs: false },
  );
}
