"use server";

import { headers } from "next/headers";
import { sendAcceptance, type SendAcceptResult } from "@/lib/quotes/acceptClient";

/** The customer's Accept (2026-10-27): handed to the staff app, which checks and records it. Customer deployment only. */
export async function acceptAction(token: string, input: unknown, store: boolean): Promise<SendAcceptResult> {
  const h = await headers();
  return sendAcceptance(String(token ?? ""), input, { store: store === true, userAgent: h.get("user-agent") });
}
