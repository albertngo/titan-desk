import { NewQuote } from "@/components/NewQuote";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { getQuickForm } from "@/lib/quotes/load";
import { newQuoteSettings } from "@/lib/quotes/start";

export const dynamic = "force-dynamic";
export const metadata = { title: "New quote" };

export default async function NewQuotePage() {
  const email = await requireQuoter();
  const [{ ghlWrites }, quick] = await Promise.all([newQuoteSettings(), getQuickForm().catch(() => [])]);
  // The form needs charge rates only: costs and contractors never reach the browser.
  const choices = quick.map((c) => ({
    ...c,
    parts: c.parts.map((p) => ({ ...p, cost: null, contractor: null })),
    product: c.product ? { ...c.product, cost: null } : null,
  }));
  return (
    <>
      <TopBar email={email} />
      <NewQuote ghlWrites={ghlWrites} choices={choices} />
    </>
  );
}
