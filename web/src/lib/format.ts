const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

export function money(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : cad.format(v);
}

/** "$5.79 /sf", "$53.00 /pc", or "Price on request". */
export function priceLabel(retail: number | null, unit: "sf" | "piece", onRequest: boolean): string {
  if (onRequest || retail === null) return "Price on request";
  return `${cad.format(retail)} /${unit === "sf" ? "sf" : "pc"}`;
}

export function num(v: number | null | undefined, suffix = ""): string {
  if (v === null || v === undefined) return "—";
  const s = Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
  return suffix ? `${s}${suffix}` : s;
}

export function yesNo(v: boolean): string {
  return v ? "Yes" : "No";
}

export function dateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "America/Toronto" }).format(new Date(iso));
}

export function timeShort(iso: string | null): string {
  if (!iso) return "never";
  return new Intl.DateTimeFormat("en-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" }).format(new Date(iso));
}

export function hoursSince(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}
