import { NewQuote } from "@/components/NewQuote";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { quickFormForBrowser } from "@/lib/quotes/quickOption";
import type { NewQuoteKind } from "@/lib/link/newQuote";
import { newQuoteSettings } from "@/lib/quotes/start";
import { customerView } from "@/lib/view";
import { duplicateOf } from "@/lib/quotes/past";

export const dynamic = "force-dynamic";

/** /new is the full quote; /new?kind=preliminary is the quick form (Albert, 2026-10-18). */
const kindOf = (kind: string | undefined): NewQuoteKind => (kind === "preliminary" ? "preliminary" : "full");

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ kind?: string; from?: string }> }) {
  const sp = await searchParams;
  return { title: sp.from ? "Duplicate quote" : kindOf(sp.kind) === "preliminary" ? "From quick form" : "New quote" };
}

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ kind?: string; from?: string }> }) {
  const email = await requireQuoter();
  const sp = await searchParams;
  // Duplicate quote (2026-11-16): /new?from=<version>, the full New quote screen with that version's options to come over.
  const from = typeof sp.from === "string" && /^rec[A-Za-z0-9]{14}$/.test(sp.from) ? sp.from : null;
  const kind = from ? "full" : kindOf(sp.kind);
  // The quick form's choices are only needed for a preliminary; a full quote opens empty in the editor.
  const prelim = kind === "preliminary";
  const [{ ghlWrites }, { choices, profiles }, customer, duplicate] = await Promise.all([
    newQuoteSettings(),
    // Charge rates only: costs and contractors never reach the browser.
    prelim ? quickFormForBrowser() : Promise.resolve({ choices: [], profiles: [] }),
    customerView(),
    from ? duplicateOf(from) : Promise.resolve(null),
  ]);
  return (
    <>
      <TopBar email={email} />
      {/* The picked customer's GHL conversation shows while the job is priced; never in Customer view. */}
      <NewQuote ghlWrites={ghlWrites} choices={choices} profiles={profiles} kind={kind} conversation={!customer} duplicate={customer ? null : duplicate} />
    </>
  );
}
