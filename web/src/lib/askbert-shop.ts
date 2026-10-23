/**
 * askBert's shop: the quick questions on its home screen and the product tiles it shows. Pure,
 * so it is unit-tested (web/tests/askbert-shop.test.ts).
 *
 * A tile is built from one of two sources, always database rows, never model text:
 * - a product askBert's catalogue tool returned (fromProduct), or
 * - a collection on promo from the grouped search (fromGroup), for the "On promo now" shelf.
 */
import { groupTitle, priceRange, splitName } from "@/lib/card";
import type { SearchGroup } from "@/lib/db/types";
import { num, priceLabel } from "@/lib/format";
import type { AskBertProduct } from "@/lib/askbert-cards";

export type ShortcutIcon = "tag" | "price" | "drop" | "stairs" | "heat" | "paw" | "box" | "compare" | "calc";

/**
 * A quick question. "send" asks it straight away; "fill" puts the start of a question in the
 * box (ending in a space) so staff type the product, e.g. "Price on " + "Vidar Macaroon".
 */
export type Shortcut = { id: string; label: string; hint: string; icon: ShortcutIcon; prompt: string; mode: "send" | "fill" };

export const SHORTCUTS: readonly Shortcut[] = [
  { id: "promo", label: "On promo", hint: "Best deals right now", icon: "tag", mode: "send",
    prompt: "What's on promo right now? Show the best deals first, with their end dates." },
  { id: "price", label: "Price check", hint: "Name a product or SKU", icon: "price", mode: "fill", prompt: "Price on " },
  { id: "waterproof", label: "Waterproof under $3", hint: "Current, per square foot", icon: "drop", mode: "send",
    prompt: "Waterproof floors under $3/sf that are current (not archived or discontinued)." },
  { id: "basement", label: "Basement-ready", hint: "Waterproof, with prices", icon: "stairs", mode: "send",
    prompt: "What's good for a basement? Confirmed waterproof options with prices." },
  { id: "radiant", label: "Radiant heat", hint: "Confirmed compatible", icon: "heat", mode: "send",
    prompt: "Which floors are confirmed radiant-heat compatible? Show current ones first." },
  { id: "pets", label: "Pet-friendly", hint: "Tough wear layers", icon: "paw", mode: "send",
    prompt: "Pet-friendly floors with a thick wear layer. Show current ones with prices." },
  { id: "stock", label: "In stock", hint: "Confirmed in stock", icon: "box", mode: "send",
    prompt: "What's confirmed in stock right now?" },
  { id: "compare", label: "Compare", hint: "Two products side by side", icon: "compare", mode: "fill", prompt: "Compare " },
  { id: "cost", label: "Cost & margin", hint: "Staff pricing", icon: "calc", mode: "fill", prompt: "Cost and margin on " },
];

/** "Shop by type" chips: each asks what that type has on promo or in stock. */
export const TYPE_CHIPS: readonly { label: string; prompt: string }[] = [
  "Vinyl", "Laminate", "Engineered hardwood", "Solid hardwood", "Tile",
].map((t) => ({ label: t, prompt: `What ${t.toLowerCase()} is on promo or in stock right now?` }));

/** One product tile. Every field is display-ready. */
export type ShopItem = {
  key: string;
  title: string;
  line: string | null;
  sku: string | null;
  image: string | null;
  price: string;
  promo: boolean;
  promoNote: string | null;
  flag: string | null; // "Archived" / "Discontinued"
  facts: string[];
  href: string;
  ask: string;
};

const CONFIRMED_STOCK = new Set(["In stock", "Low stock"]);

/** "Oct 31" from "2026-10-31" (a bare Airtable date, formatted in UTC so the day never shifts). */
function dayMonth(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** A product askBert's catalogue tool returned. */
export function fromProduct(p: AskBertProduct): ShopItem {
  const name = splitName(p.name, p.brand, p.sku);
  const facts: string[] = [];
  if (p.waterproof === "yes") facts.push("Waterproof");
  if (p.width_in !== null) facts.push(`${num(p.width_in)}" wide`);
  if (p.wear_layer_mil !== null) facts.push(`${num(p.wear_layer_mil)} mil`);
  if (CONFIRMED_STOCK.has(p.stock)) facts.push(p.stock);
  return {
    key: `p:${p.sku}`,
    title: name.title,
    line: name.line,
    sku: p.sku,
    image: p.thumb_url,
    price: priceLabel(p.price.amount, p.price.unit, p.price.on_request),
    promo: p.promo,
    promoNote: p.promo ? (p.promo_ends ? `Promo to ${dayMonth(p.promo_ends)}` : "On promo") : null,
    flag: p.status === "archived" ? "Archived" : p.status === "discontinued" ? "Discontinued" : null,
    facts,
    href: p.url,
    ask: `Tell me about ${p.sku}: price, promo, stock and the specs that matter.`,
  };
}

/** A collection from the grouped search (one tile for all its colours). */
export function fromGroup(g: SearchGroup): ShopItem {
  const first = g.members[0];
  const single = g.product_count === 1 && first;
  const title = single
    ? splitName(first.product_name, first.brand, first.sku).title
    : groupTitle(g.line, g.brand, first?.product_name ?? g.group_key);
  const photo = g.members.find((m) => m.hero?.card || m.hero?.thumb)?.hero ?? null;
  const facts: string[] = [];
  if (!single) facts.push(`${g.product_count} colours`);
  if (g.waterproof) facts.push("Waterproof");
  if (g.width_in !== null) facts.push(`${num(g.width_in)}" wide`);
  return {
    key: `g:${g.group_key}`,
    title,
    line: single ? splitName(first.product_name, first.brand, first.sku).line : g.category,
    sku: single ? first.sku : null,
    image: photo?.card ?? photo?.thumb ?? null,
    price: priceRange(g.price_min, g.price_max, g.price_unit),
    promo: g.any_promo,
    promoNote: g.any_promo ? "On promo" : null,
    flag: null,
    facts,
    href: first ? `/p/${encodeURIComponent(first.sku)}` : "/",
    ask: single
      ? `Tell me about ${first.sku}: price, promo end date and stock.`
      : `What's on promo in ${title}? Show the colours, prices and the promo end date.`,
  };
}
