"use server";

import { quoteAppointments, type QuoteApptsResult } from "@/lib/quotes/appointments";

/** Appointments on All quotes (2026-11-26): the list asks once it has drawn. Read only; checks the quoter allowlist inside. */
export async function quoteAppointmentsAction(): Promise<QuoteApptsResult> {
  return quoteAppointments().catch((e) => {
    console.error("quoteAppointmentsAction", e);
    return { ok: false as const, message: "Appointments couldn't be read. Try again in a moment." };
  });
}
