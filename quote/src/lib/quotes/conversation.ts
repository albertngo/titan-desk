import "server-only";
import { requireQuoter } from "@/lib/auth";
import { sortThread, type Message } from "@/lib/conversation/thread";
import { conversationMessages, conversationsForContact, emailMessage, ghlConfigured, GhlNotConfigured } from "@/lib/ghl/client";
import { ghlConversationUrl } from "@/lib/ghl/ids";
import type { ConversationResult } from "./types";

/**
 * The customer's conversation from GHL, for the quote page and the New quote screen (Albert,
 * 2026-10-20): what they wrote, what we sent them, and the photos they texted, so the quote is
 * priced from what the customer actually said. Read live every time, stored nowhere, and
 * never written back: replying stays in GHL. Only a quoter may ask, and only on the staff app
 * (the customer deployment has no GHL token and never imports this file).
 */

/** How many of a contact's conversations are read (nearly everyone has one). */
const MAX_CONVERSATIONS = 3;
/** How many emails whose list entry had no body are fetched in full. */
const MAX_EMAIL_FETCHES = 8;
/** GHL gets this long for the whole read; past it the screen says so and offers GHL itself. */
const WAIT_MS = 12_000;
const slow = () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("GHL too slow")), WAIT_MS));

export async function loadConversation(contactId: string): Promise<ConversationResult> {
  await requireQuoter();
  if (!/^[A-Za-z0-9]+$/.test(contactId)) return { ok: false, reason: "error", message: "No GHL contact on this quote." };
  if (!ghlConfigured()) return { ok: false, reason: "not-configured", message: new GhlNotConfigured().message };
  try {
    return await Promise.race([read(contactId), slow()]);
  } catch (e) {
    console.error("loadConversation", e);
    return { ok: false, reason: "error", message: "GHL didn't answer. Open the conversation in GHL instead, or try again in a moment." };
  }
}

async function read(contactId: string): Promise<ConversationResult> {
  const conversations = (await conversationsForContact(contactId)).slice(0, MAX_CONVERSATIONS);
  const pages = await Promise.all(conversations.map((c) => conversationMessages(c.id)));
  const messages = await withEmailBodies(sortThread(pages.flatMap((p) => p.messages)));
  return {
    ok: true,
    messages,
    more: pages.some((p) => p.more),
    ghlUrl: conversations[0] ? ghlConversationUrl(conversations[0].id) : null,
  };
}

/** Emails whose list entry carried no text get their full body, newest first, a few at most; a failed fetch leaves the entry as it was. */
async function withEmailBodies(messages: Message[]): Promise<Message[]> {
  const wanted = [...messages].reverse().filter((m) => m.channel === "email" && !m.body && m.emailId).slice(0, MAX_EMAIL_FETCHES);
  if (wanted.length === 0) return messages;
  const fetched = await Promise.all(wanted.map((m) => emailMessage(m.emailId as string).catch(() => null)));
  const byId = new Map(wanted.map((m, i) => [m.id, fetched[i]] as const));
  return messages.map((m) => {
    const full = byId.get(m.id);
    return full ? { ...m, body: full.body ?? m.body, subject: m.subject ?? full.subject } : m;
  });
}
