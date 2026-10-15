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
- **The copy follows GHL (2026-10-14).** Each time a quote opens, `src/lib/quotes/refresh.ts`
  reads GHL and updates the copy: name, phone and email from the contact; an *unconfirmed*
  address from the contact; a *confirmed* address from the opportunity's Project Address; and
  no address change once won (Notion owns it). Nothing is blanked. Rules: `src/lib/link/refresh.ts`,
  tested in `tests/refresh.test.ts`. GHL being down never stops a quote opening.
- **Where the site address comes from (Albert, 2026-10-15).** Staff type it on the GHL contact,
  nowhere else: the contact's address is where the next appointment is (the booking texts read
  it too). It reaches the job's opportunity at three moments only: GHL's own workflow fills a
  blank Project Address when an opportunity is created (unconfirmed); booking (`/api/booking`)
  copies the contact's address onto that job as the confirmed site; "Address arrived" fills a
  booked job's site that is still blank. A confirmed site never changes because the contact did;
  fixing one is done on the opportunity's Project Address. The app writes a site onto an
  opportunity only when it is confirmed.
- **One shared name:** `First Surname - MMYY - Q-1234`, then ` - PP-412` once won. First name
  first (Albert, 2026-10-14); MMYY is the month the quote was created, in Toronto time, never the
  city, which customers type loosely (2026-10-15). The name never changes once a folder has it. `displayName()` in `src/lib/link/identity.ts` and the Quotes table's Display Name
  formula must match; change both together.
- **Supabase is used for sign-in only** (the desk's project and Microsoft login).
- **`src/lib/calc.ts` is the only place money is computed**, and it mirrors the Airtable
  formulas field for field. Change one, change both, in the same piece of work. Every quote
  page shows a parity check against Airtable's own rollups; a red banner is a bug.
- **The editor keeps drafts on the device** (localStorage, per quote) until they are saved.
  Every change is a pure function in `src/lib/editor/model.ts`; the screen only calls
  them. Test new behaviour there, not through the UI.
- **Saving (milestone 3, 2026-10-14).** What to write is decided in `src/lib/quotes/savePlan.ts`
  (pure, tested in `tests/save.test.ts`); `src/lib/quotes/save.ts` carries it out. Only a Draft
  version is overwritten, and only if Airtable still matches what the editor opened (a
  fingerprint check), so newer work is never overwritten. Sent and later versions change only
  by **Save as new version**. Only records already on the version are updated; anything else
  the browser sends is created new. Removed lines and options are detached, never deleted.
  Select values off Airtable's own lists are saved blank, because typecast would invent them.

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
   `QUOTE_MAKE_GHL_HOOK` / `QUOTE_MAKE_GHL_KEY`, called only from `src/lib/quotes/start.ts` and `src/lib/quotes/booking.ts`.
   Set those two variables only after the scenario is switched on: a request to a scenario
   that is off waits in Make's queue and would run later.
2c. **One path without a sign-in:** `/api/booking`, called by Make 3453735 when an appointment
   is confirmed. The proxy lets only that path through; the route and every function in
   `src/lib/quotes/booking.ts` check `QUOTE_BOOKING_KEY` first (constant-time; unset = off). Make
   sends only the contact id and, when GHL has one, the opportunity id; the customer is read from
   GHL, never taken from the request. It writes the Quotes table (and a version 1), and creates a
   GHL opportunity through Make only when the contact had none open and none lost or abandoned in the
   last 90 days (that may be the job coming back: the quote is flagged for staff instead). An
   opportunity GHL sends that isn't open, or isn't in a project pipeline (a STORE order), is ignored.
   It answers `made: true` when the job's folder and CompanyCam project already exist (links on the
   quote, or a CompanyCam URL on the opportunity), and Make then skips making them.
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
