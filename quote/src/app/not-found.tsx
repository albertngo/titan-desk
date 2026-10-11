import Link from "next/link";

export default function NotFound() {
  return (
    <main className="center">
      <h1>Quote not found</h1>
      <p>It may have been deleted in Airtable, or the link is wrong.</p>
      <p><Link href="/">Back to all quotes</Link></p>
    </main>
  );
}
