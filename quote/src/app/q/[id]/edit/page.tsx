import { notFound, redirect } from "next/navigation";
import { ConversationDrawer } from "@/components/Conversation";
import { EditorClient } from "@/components/editor/EditorClient";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { fromQuote } from "@/lib/editor/model";
import { previewCopy } from "@/lib/quotes/send";
import { picksOf } from "@/lib/accept/plan";
import { swapSource } from "@/lib/change/swap";
import { acceptedVersionOf, getQuote, getRateCard, workingDraftOf } from "@/lib/quotes/load";
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
  // One working quote (2026-10-30): editing a sent version opens the draft already being worked on, if there is one.
  if (loaded.status !== "Draft" && !loaded.changeNo && !(loaded.acceptance && !loaded.acceptance.cancelled)) {
    const draft = await workingDraftOf(loaded);
    if (draft) redirect(`/q/${draft.id}/edit`);
  }
  const quote = await refreshFromGhl(loaded);
  const initial = fromQuote(quote);
  // A change after acceptance (2026-10-27): the editor shows how far it moves the contract's total.
  const contract = quote.changeNo ? (await previewCopy(quote.id))?.change ?? null : null;
  const change = quote.changeNo ? { no: quote.changeNo, contractTotal: contract?.before.total ?? null } : null;
  // Swap option (2026-10-30): on a draft change, the accepted version's other options the customer could take instead.
  const accepted = quote.changeNo && quote.status === "Draft" ? await acceptedVersionOf(quote) : null;
  const swap = accepted?.acceptance ? swapSource(fromQuote(accepted), picksOf(accepted.acceptance).map((p) => p.ref), accepted.version) : null;
  const version = { id: quote.id, label: quote.quoteId, version: quote.version, status: quote.status, basis: quote.basis, base: fingerprint(initial), change, agreed: Boolean(quote.acceptance && !quote.acceptance.cancelled) };
  return (
    <>
      <TopBar email={email} />
      {/* The customer's GHL conversation beside the lines being priced: staff only, never in Customer view. */}
      {!customer && quote.link?.ghlContactId && <ConversationDrawer contactId={quote.link.ghlContactId} />}
      <EditorClient initial={initial} card={card} backHref={`/q/${quote.id}`} version={version} customer={customer} swap={swap} />
    </>
  );
}
