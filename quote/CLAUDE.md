# quote/ — the quoting app

Titan Flooring's quoting tool: one tab per complete option, work-type sections, card rate
vs override on every line, an Analysis tab. Its own Vercel project and its own address,
built from this repo (Albert, 2026-10-11). These rules sit alongside the repo-root
CLAUDE.md; where they differ, this file governs `quote/` and nothing outside it.

## Where things live

- **Quotes and rates live in Airtable** (Bert base): Quotes → Quote Versions → Quote
  Options → Quote Lines, priced from Rate Card / Stair Items / the catalogue. Airtable is
  the store; the app is a screen on it. Notion only ever gets read-only copies.
- **Words (Albert, 2026-10-14):** a *quote* (Q-1234) is one per GHL opportunity; its
  *versions* are v1 (preliminary), v2 (measured)…; a won quote becomes a Notion *project*
  (PP-412). "Job" and "family" are retired. The tables were renamed in Airtable on that date
  (Quote Families → Quotes, Quotes → Quote Versions); IDs did not change.
- **GHL owns the customer.** Name, phone, email and address are display copies on the quote;
  staff edit them in GHL. The app reads GHL to find a customer and their opportunities and
  never writes to it with a token of its own. GHL changes go through one Make scenario,
  "Quote app → GHL" (4975508): the app builds the exact request bodies in
  `src/lib/link/ghlRequest.ts` (tested) and Make forwards them with its GHL connection. Matching rules
  (opportunity, then contact, then phone, then email; never a name; fill blanks only) live in
  `src/lib/link/` and are tested in `tests/link.test.ts`.
- **Supabase is used for sign-in only** (the desk's project and Microsoft login).
- **`src/lib/calc.ts` is the only place money is computed**, and it mirrors the Airtable
  formulas field for field. Change one, change both, in the same piece of work. Every quote
  page shows a parity check against Airtable's own rollups; a red banner is a bug.
- **The editor keeps drafts on the device** (localStorage, per quote) until saving to Airtable
  exists. Every change is a pure function in `src/lib/editor/model.ts`; the screen only calls
  them. Test new behaviour there, not through the UI.

## Hard rules

1. **One file talks to Airtable:** `src/lib/airtable/client.ts`. It alone reads
   `QUOTE_AIRTABLE_TOKEN`, it is `server-only`, and the token never reaches a browser.
   `tests/boundary.test.ts` enforces all of this.
2. **Writes go to the four quote tables only.** Since 2026-10-14 the client can create
   (POST) and update (PATCH) records, never delete or replace, and `write()` refuses any
   table outside `WRITABLE_TABLES` (Quotes, Quote Versions, Quote Options, Quote Lines).
   Only the files listed in the boundary test's `WRITERS` may call it. Never a write to the
   catalogue, Rate Card or Stair Items from this app.
2a. **One file talks to GHL, and only reads:** `src/lib/ghl/client.ts`, `server-only`, GET
   only, the only reader of `QUOTE_GHL_TOKEN` (contacts.readonly + opportunities.readonly).
2b. **One file sends to Make:** `src/lib/make/client.ts`, `server-only`, the only reader of
   `QUOTE_MAKE_GHL_HOOK` / `QUOTE_MAKE_GHL_KEY`, called only from `src/lib/quotes/start.ts`.
   Set those two variables only after the scenario is switched on: a request to a scenario
   that is off waits in Make's queue and would run later.
3. **Staff is not enough.** Only emails on `QUOTE_ALLOWED_EMAILS` get in. The proxy checks
   it and every loader in `src/lib/quotes/load.ts` and `src/lib/quotes/start.ts` checks again
   (`requireQuoter()`). An empty list lets nobody in.
4. **No real data in the repo.** It is public. Tests use invented numbers; never commit a
   real customer, address, rate or cost — not as a fixture, not in a comment.
5. **Never import from `web/` or from `titan-agents`.** Copy the small thing instead; a
   shared folder comes when a third app needs it.
6. **The Excel template stays the fallback.** If Airtable or this app is down, Albert
   quotes in Excel. Nothing here may make that harder.

## Commands

```
cd quote
npm install
npm run dev          # http://localhost:3001 (needs .env.local, see README.md)
npm run lint && npm run typecheck && npm test
```
