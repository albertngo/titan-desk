"use server";

import { loadConversation } from "@/lib/quotes/conversation";
import type { ConversationResult } from "@/lib/quotes/types";

/** The customer's GHL conversation, for the quote page and New quote. Checks the quoter allowlist inside. */
export async function conversationAction(contactId: string): Promise<ConversationResult> {
  return loadConversation(String(contactId ?? ""));
}
