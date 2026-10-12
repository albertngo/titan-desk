import { EditorClient } from "@/components/editor/EditorClient";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { blankQuote } from "@/lib/editor/model";
import { getRateCard } from "@/lib/quotes/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "New quote" };

export default async function NewQuotePage() {
  const email = await requireQuoter();
  const card = await getRateCard();
  return (
    <>
      <TopBar email={email} />
      <EditorClient initial={blankQuote()} card={card} backHref="/" />
    </>
  );
}
