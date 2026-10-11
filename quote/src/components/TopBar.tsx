import Link from "next/link";

export function TopBar({ email }: { email: string }) {
  return (
    <div className="top">
      <Link href="/" className="brand">Titan Quotes</Link>
      <span>{email}</span>
      <form action="/auth/signout" method="post">
        <button className="linkbtn">Sign out</button>
      </form>
    </div>
  );
}
