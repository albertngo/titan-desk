import Link from "next/link";

export function TopBar({ email }: { email: string }) {
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand">
          <span className="brand-mark">T</span>
          Titan Quotes
        </Link>
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
