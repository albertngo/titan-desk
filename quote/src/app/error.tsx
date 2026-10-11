"use client";

/** Shown when Airtable cannot be reached or answers with an error. The Excel template is the fallback. */
export default function QuoteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="center">
      <h1>Airtable did not answer</h1>
      <p>
        The quotes could not be loaded. Nothing was changed. Try again in a minute; if it keeps failing, quote in the
        Excel template and enter the job here once Airtable is back.
      </p>
      {error.digest && <p className="note">Reference: {error.digest}</p>}
      <button className="btn" onClick={reset}>Try again</button>
    </main>
  );
}
