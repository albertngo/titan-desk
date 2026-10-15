import Link from "next/link";
import { customerView } from "@/lib/view";
import { ViewSwitch } from "./ViewSwitch";

export async function TopBar({ email }: { email: string }) {
  const customer = await customerView();
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand">
          <span className="brand-mark">T</span>
          Titan Quotes
        </Link>
        <ViewSwitch on={customer} />
        <div className="who">
          <span className="email">{email}</span>
          <span className="avatar" aria-hidden>{email.slice(0, 2)}</span>
          <form action="/auth/signout" method="post">
            <button className="linkbtn">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
