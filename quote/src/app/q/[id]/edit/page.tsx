import { notFound } from "next/navigation";
import { EditorClient } from "@/components/editor/EditorClient";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { fromQuote } from "@/lib/editor/model";
import { getQuote, getRateCard } from "@/lib/quotes/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit quote" };

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const email = await requireQuoter();
  const { id } = await params;
  const [quote, card] = await Promise.all([getQuote(id), getRateCard()]);
  if (!quote) notFound();
  return (
    <>
      <TopBar email={email} />
      <EditorClient initial={fromQuote(quote)} card={card} backHref={`/q/${quote.id}`} />
    </>
  );
}
