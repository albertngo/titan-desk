import { round2 } from "@/lib/calc";

/**
 * Service level (Albert, 2026-10-16). The level sets the customer's price; the crew sets our
 * cost. Standard is the Rate Card as it stands. Premium is for higher-end clients and needs:
 * labour priced from the card goes up by PREMIUM_MARKUP, cost does not, so the extra is margin.
 *
 * Premium touches labour only: Rate Card lines of the labour types below, and Stair Items.
 * Materials (catalogue products), disposal and anything typed in by hand keep their price, and
 * a price someone typed over the card (an override) is never changed.
 *
 * The premium price is written into the line's card price (Unit Price Snap) when the line is
 * priced, so calc.ts and Airtable's own formulas need no change and stay in parity.
 */

export const SERVICE_LEVELS = ["Standard", "Premium"] as const;
export type ServiceLevel = (typeof SERVICE_LEVELS)[number];

/** +15% to start (Albert, 2026-10-16). */
export const PREMIUM_MARKUP = 0.15;

/** Rate Card labour types Premium applies to. Disposal is not labour. */
export const PREMIUM_LABOUR_TYPES: readonly string[] = ["Install", "Remove", "Refinish", "Sand", "Paint"];

export const levelOf = (o: { serviceLevel?: string | null }): ServiceLevel => (o.serviceLevel === "Premium" ? "Premium" : "Standard");

/** Whether the service level changes this line's price. A Stair Profile's preset (2026-10-20) is a customer price as set: never marked up. */
export function levelApplies(l: { sourceKind: string; labourType: string | null }): boolean {
  if (l.sourceKind === "stair") return true;
  return l.sourceKind === "rate" && l.labourType !== null && PREMIUM_LABOUR_TYPES.includes(l.labourType);
}

/** The customer price for a card rate at a service level. */
export function levelPrice(cardRate: number, level: ServiceLevel, applies: boolean): number {
  return level === "Premium" && applies ? round2(cardRate * (1 + PREMIUM_MARKUP)) : cardRate;
}
