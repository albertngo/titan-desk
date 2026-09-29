/**
 * Which products an askBert answer refers to, for the cards under it. Pure.
 *
 * Card data always comes from the catalogue tool's own output (database rows), never from the
 * model's text, so an invented SKU cannot produce a card. The text only decides which of the
 * returned products to show and in what order: the ones the answer names, as it names them.
 * If the answer names none, the first few returned products are shown.
 */
import type { ProductOut, QueryOutput } from "../../agents/askbert/agent/lib/schema";

export type AskBertProduct = ProductOut;

/** The subset of eve's message shape this module reads. */
export type MessageLike = {
  role: "assistant" | "user";
  parts: readonly ({ type: string } & Record<string, unknown>)[];
};

const FALLBACK = 5;

function toolProducts(part: Record<string, unknown>): ProductOut[] {
  if (part.type !== "dynamic-tool" || part.toolName !== "query_catalogue") return [];
  if (part.state !== "output-available" || part.partial) return [];
  const products = (part.output as QueryOutput | undefined)?.products;
  return Array.isArray(products) ? products : [];
}

/** Text of an assistant message (its text parts, in order). */
export function messageText(message: MessageLike): string {
  return message.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
}

/** Products referenced by one assistant message, in the order the answer mentions them. */
export function referencedProducts(message: MessageLike): ProductOut[] {
  const bySku = new Map<string, ProductOut>();
  for (const part of message.parts) for (const p of toolProducts(part)) if (!bySku.has(p.sku)) bySku.set(p.sku, p);
  if (bySku.size === 0) return [];

  const text = messageText(message);
  const named = [...bySku.values()]
    .map((p) => ({ p, at: text.indexOf(p.sku) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.p);
  return named.length > 0 ? named : [...bySku.values()].slice(0, FALLBACK);
}

/** Whether the conversation is waiting on eve's cost-cap continuation prompt. */
export function hitSessionLimit(messages: readonly MessageLike[]): boolean {
  return messages.some((m) => m.parts.some((p) => p.type === "dynamic-tool" && p.state === "approval-requested"));
}
