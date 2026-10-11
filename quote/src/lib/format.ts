const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const plain = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 });

/** $1,234.50; blank for null. */
export const money = (n: number | null | undefined) => (n === null || n === undefined ? "" : cad.format(n));
/** Unit rates keep up to 2 decimals without a currency symbol in dense grids. */
export const rate = (n: number | null | undefined) => (n === null || n === undefined ? "" : plain.format(n));
export const pct = (n: number | null | undefined, places = 1) =>
  n === null || n === undefined ? "" : `${n.toFixed(places)}%`;
