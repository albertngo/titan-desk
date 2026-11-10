import { FollowUpList } from "@/components/FollowUpList";
import { TopBar } from "@/components/TopBar";
import Link from "next/link";
import { isAdmin } from "@/lib/access";
import { requireQuoter } from "@/lib/auth";
import { loadFollowUps } from "@/lib/quotes/followup";

export const dynamic = "force-dynamic";

/** The Follow up page (Albert, 2026-11-07): every sent quote still waiting on the customer, the due ones first. */
export default async function FollowUpPage() {
  const email = await requireQuoter();
  const data = await loadFollowUps();
  return (
    <>
      <TopBar email={email} />
      <div className="page">
        <div className="pagehead">
          <div className="titles">
            <h1>Follow up</h1>
            <p>
              Sent quotes still waiting on the customer, due first. A text, email or call in GHL counts as a follow-up on its own.
              {isAdmin(email) && (
                <>
                  {" "}
                  <Link href="/performance">Performance</Link>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="tape" aria-hidden />
        <FollowUpList data={data} />
      </div>
    </>
  );
}
