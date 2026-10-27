/**
 * askBert's quick questions (its home screen and the chips above the input). Pure, tested in
 * web/tests/askbert-shop.test.ts. The product tiles it shows live in lib/shop.ts.
 */
export { fromGroup, fromHit, fromProduct, type ShopItem } from "@/lib/shop";

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
