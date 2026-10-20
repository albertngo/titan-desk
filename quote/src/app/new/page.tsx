import { NewQuote } from "@/components/NewQuote";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { getQuickForm, getStairProfiles } from "@/lib/quotes/load";
import type { NewQuoteKind } from "@/lib/link/newQuote";
import { newQuoteSettings } from "@/lib/quotes/start";
import { customerView } from "@/lib/view";

export const dynamic = "force-dynamic";

/** /new is the full quote; /new?kind=preliminary is the quick form (Albert, 2026-10-18). */
const kindOf = (kind: string | undefined): NewQuoteKind => (kind === "preliminary" ? "preliminary" : "full");

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  return { title: kindOf((await searchParams).kind) === "preliminary" ? "Preliminary quote" : "New quote" };
}

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const email = await requireQuoter();
  const kind = kindOf((await searchParams).kind);
  // The quick form's choices are only needed for a preliminary; a full quote opens empty in the editor.
  const prelim = kind === "preliminary";
  const [{ ghlWrites }, quick, profileRows, customer] = await Promise.all([
    newQuoteSettings(),
    prelim ? getQuickForm().catch(() => []) : Promise.resolve([]),
    prelim ? getStairProfiles().catch(() => []) : Promise.resolve([]),
    customerView(),
  ]);
  // Stair Profiles for the dropdown: the preset price only; cost and the builder's template stay on the server.
  const profiles = profileRows.map(({ id, name, type, method, steps, price }) => ({ id, name, type, method, steps, price, cost: null }));
  // The form needs charge rates only: costs and contractors never reach the browser.
  const choices = quick.map((c) => ({
    ...c,
    parts: c.parts.map((p) => ({ ...p, cost: null, contractor: null })),
    product: c.product ? { ...c.product, cost: null } : null,
  }));
  return (
    <>
      <TopBar email={email} />
      {/* The picked customer's GHL conversation shows while the job is priced; never in Customer view. */}
      <NewQuote ghlWrites={ghlWrites} choices={choices} profiles={profiles} kind={kind} conversation={!customer} />
    </>
  );
}
