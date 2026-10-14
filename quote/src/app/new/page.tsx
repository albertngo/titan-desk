import { NewQuote } from "@/components/NewQuote";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { newQuoteSettings } from "@/lib/quotes/start";

export const dynamic = "force-dynamic";
export const metadata = { title: "New quote" };

export default async function NewQuotePage() {
  const email = await requireQuoter();
  const { ghlWrites } = await newQuoteSettings();
  return (
    <>
      <TopBar email={email} />
      <NewQuote ghlWrites={ghlWrites} />
    </>
  );
}
