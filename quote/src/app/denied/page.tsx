import { signedInEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "No access" };

export default async function Denied() {
  const email = await signedInEmail();
  return (
    <main className="center">
      <h1>No access to quoting</h1>
      <p>
        {email ? <>You are signed in as <b>{email}</b>, which is not on the quoting list.</> : <>You are not signed in.</>}{" "}
        Ask Albert to add you.
      </p>
      <form action="/auth/signout" method="post">
        <button className="btn">Sign out</button>
      </form>
    </main>
  );
}
