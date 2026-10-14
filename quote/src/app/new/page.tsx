import { NewQuote } from "@/components/NewQuote";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "New quote" };

export default async function NewQuotePage() {
  const email = await requireQuoter();
  return (
    <>
      <TopBar email={email} />
      <NewQuote />
    </>
  );
}
