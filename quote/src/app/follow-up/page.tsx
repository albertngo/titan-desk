import { FollowUpList } from "@/components/FollowUpList";
import { TopBar } from "@/components/TopBar";
import Link from "next/link";
import { isAdminEmail } from "@/lib/settings/settings";
import { requireQuoter } from "@/lib/auth";
import { loadFollowUps } from "@/lib/quotes/followup";

export const dynamic = "force-dynamic";

/** The Follow up page (Albert, 2026-11-07), a morning brief since 2026-11-22: every sent quote still waiting on the customer. */
export default async function FollowUpPage() {
  const email = await requireQuoter();
  const data = await loadFollowUps();
  const admin = await isAdminEmail(email);
  return (
    <>
      <TopBar email={email} />
      <div className="page">
        <div className="pagehead">
          <div className="titles">
            <h1>Follow up</h1>
            <p>
              Who to reach today, and the one next step for each. Open a person for the brief, the conversation and every action.
              {admin && (
                <>
                  {" "}
                  <Link href="/performance">Performance</Link> · <Link href="/settings">Settings</Link>
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
