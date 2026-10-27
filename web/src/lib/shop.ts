/**
 * Shop tiles: the photo-first product tile used across the desk (search results, browse, the
 * promo shelf) and askBert. Pure, so it is unit-tested (web/tests/shop.test.ts and
 * web/tests/askbert-shop.test.ts).
 *
 * A tile is always built from database rows, never model text:
 * - a product askBert's catalogue tool returned (fromProduct),
 * - a collection from the grouped search (fromGroup), or
 * - a single product from the flat search (fromHit).
 */
import { groupTitle, priceRange, splitName } from "@/lib/card";
import type { SearchGroup, SearchHit } from "@/lib/db/types";
import { num, priceLabel } from "@/lib/format";
import type { AskBertProduct } from "@/lib/askbert-cards";

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

/** A single product from the flat (every product) search. */
export function fromHit(h: SearchHit): ShopItem {
  const name = splitName(h.product_name, h.brand, h.sku);
  const facts: string[] = [];
  if (h.waterproof) facts.push("Waterproof");
  if (h.width_in !== null) facts.push(`${num(h.width_in)}" wide`);
  if (h.wear_layer_mil !== null) facts.push(`${num(h.wear_layer_mil)} mil`);
  if (h.stock_status && CONFIRMED_STOCK.has(h.stock_status)) facts.push(h.stock_status);
  return {
    key: `h:${h.sku}`,
    title: [name.title, name.badge].filter(Boolean).join(" · "),
    line: name.line,
    sku: h.sku,
    image: h.hero?.card ?? h.hero?.thumb ?? null,
    price: priceLabel(h.retail_price, h.price_unit, h.price_on_request),
    promo: h.promo_active,
    promoNote: h.promo_active ? "On promo" : null,
    flag: h.coming_soon ? "Coming soon" : h.stock_status === "Discontinued" ? "Discontinued" : null,
    facts,
    href: `/p/${encodeURIComponent(h.sku)}`,
    ask: `Tell me about ${h.sku}: price, promo, stock and the specs that matter.`,
  };
}
