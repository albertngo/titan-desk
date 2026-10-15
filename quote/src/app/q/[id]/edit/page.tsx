import { notFound } from "next/navigation";
import { EditorClient } from "@/components/editor/EditorClient";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { fromQuote } from "@/lib/editor/model";
import { getQuote, getRateCard } from "@/lib/quotes/load";
import { refreshFromGhl } from "@/lib/quotes/refresh";
import { fingerprint } from "@/lib/quotes/savePlan";
import { customerView } from "@/lib/view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit quote" };

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const email = await requireQuoter();
  const { id } = await params;
  const [loaded, card, customer] = await Promise.all([getQuote(id), getRateCard(), customerView()]);
  if (!loaded) notFound();
  const quote = await refreshFromGhl(loaded);
  const initial = fromQuote(quote);
  const version = { id: quote.id, label: quote.quoteId, version: quote.version, status: quote.status, basis: quote.basis, base: fingerprint(initial) };
  return (
    <>
      <TopBar email={email} />
      <EditorClient initial={initial} card={card} backHref={`/q/${quote.id}`} version={version} customer={customer} />
    </>
  );
}
