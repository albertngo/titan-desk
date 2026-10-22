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
- **Linking (2026-10-15).** A quote that says Needs linking shows **Link to Opportunity** on its
  page: the customer's open project opportunities, and ones lost or abandoned in the last 90 days
  (never won, never STORE; one opportunity, one quote). Linking sends the quote number, the
  confirmed site and the CompanyCam link to the opportunity through Make (never over a CompanyCam
  link it already has), sets a lost or abandoned one back to open, and only then marks the quote
  Linked. Rules: `src/lib/link/linkJob.ts`, tested in `tests/linkJob.test.ts`.
- **Confirm address (Albert, 2026-10-15).** Linking never confirms an address; booking does, and so
  does **Confirm address** on the quote page, for a site checked with the customer some other way.
  It confirms only the address the person saw (refused if it changed since the page opened), never
  a won job's, and on a linked quote writes it to the opportunity through Make before marking it
  Confirmed. Rule: `confirmAddressCheck()` in `src/lib/link/linkJob.ts`.
- **Fix address (Albert, 2026-10-21).** A wrong address is fixed where it lives, never typed in the
  app: an unconfirmed one on the GHL contact; a confirmed site on the opportunity's Project Address
  (a booking with the wrong contact address confirms the wrong site, and the contact alone no longer
  changes it); a won job's on the Notion project. **Fix address** beside the address chip on the quote
  page, and in the editor's customer strip, opens the right one, and the quote follows it the next
  time it opens. Rule: `fixAddressLink()` in `src/lib/link/linkJob.ts`, tested in `tests/linkJob.test.ts`.
- **Two ways to start a quote (Albert, 2026-10-18).** The front page has **+ New quote** (`/new`:
  customer with the site address folded in, then timeline; v1 is *Measured* and opens empty in the
  editor) and **+ Preliminary quote** (`/new?kind=preliminary`: the job first, then customer, then
  timeline, with the step numbers counted; v1 is *Preliminary* with one priced option, opened for
  review). The request says `kind: "measured"` for the first; anything else is a preliminary
  (`parseNewQuote()` in `src/lib/link/newQuote.ts`).
- **Quick form = the preliminary (Albert, 2026-10-15; phone layout 2026-10-18).** "Job", step 1
  of a preliminary, replaces the GHL "Preliminary Mobile Quote" form and its workflow: pick flooring
  work from short lists, type square footage, add staircases, see a live estimate. Laid out for a
  phone: Flooring, then Stairs, then anything else; each work group folds to a one-line summary;
  short lists are chips; "Same as install" copies the square footage onto Remove and Material rows;
  every row shows its rate and its total beside the selection, priced the same way the quote will
  be (`choiceRate()` / `rowTotal()` in `plan.ts`); the estimate and Create stay on screen
  (`src/components/QuickWork.tsx`). The flooring choices are
  rows in the Airtable table **Quick Quote Choices** (`QUICK_TABLE`), each pointing at Rate Card
  rows or, for materials, a standard catalogue **SKU** (text, not a link, so the catalogue's
  schema and its drift check are untouched); staff can pick a different SKU. Prices are never
  stored on a choice and never taken from the browser: the server re-prices from Airtable at
  create time. A choice whose linked row is inactive or unpriced is left off the form. Rules:
  `src/lib/quick/plan.ts`, tested in `tests/quick.test.ts`.
- **Stairs on the preliminary (Albert, 2026-10-18; presets 2026-10-20).** A staircase is a row of the
  read-only Airtable table **Stair Profiles** (`PROFILE_TABLE`): a customer-facing name, a stair type
  (Main stairs / Townhome / Basement / Half staircase), a method (Sand & stain / Solid red oak caps /
  Vinyl treads / Vinyl flooring), the step count the price assumes, a **preset price and cost** (the
  old GHL dropdown's numbers; a stored price by design, so the preliminary shows a margin), and six
  links to Stair Items for the builder. The form is one dropdown per staircase, up to three, with
  "Different price" as the only override; the line it makes has the row as its source (Quote Lines →
  **Stair Profile**, `sourceKind: "profile"`), the preset as its card figures, and is never marked up
  by Premium. The customer-facing phrases live in code, `src/lib/quick/stairs.ts` (copy, not data),
  and the old GHL stairs prompt is written out there as `stairDescription()` from each row's type and
  method: one bullet per staircase, the stair type's sentence, the closing sentence only when no
  staircase got one. Create writes it into the option's description. A row with an unknown type or
  method, or no price, is left off. With no rows at all the editor's picker falls back to type ×
  method at a typed price. Tested in `tests/quick.test.ts` and `tests/stairs.test.ts`.
- **The stair builder (Albert, 2026-10-20).** In the editor's Stairs picker, picking a Stair Profile
  opens the builder: steps (the row's default), open-side steps, handrail feet, spindles and posts.
  `expandProfile()` in `src/lib/editor/stairBuilder.ts` multiplies the row's six "Per …" links into
  Stair Item lines priced from the card at the option's service level (an open-side step takes the
  place of a plain step piece but still counts for risers and sanding; a zero count makes no line; an
  item the card no longer offers is reported, never guessed; a row with no links says so). **Add
  staircase** adds the lines and, when ticked, replaces the preliminary's preset line for that
  profile (`addLines()` in `src/lib/editor/model.ts`), so the measured quote is an edit of the
  preliminary. Tested in `tests/stairBuilder.test.ts`. Next (not built): Material Group / Default
  Material on Stair Items for spindle, picket and post types, like the Rate Card's.
- **Stairs is its own section again (Albert, 2026-10-18)**, after Install, everywhere sections
  show (quote page, editor, customer page, PDF, Analysis), with its own subtotal; Stair Items are
  offered in that section only. This reverses the 2026-10-12 fold into Install; Refinish, Paint
  and Sand still fold. Grouping only: no money formula and no Airtable change.
- **The GHL mobile-quote workflow is retired (Albert, 2026-10-18).** Its form, custom fields
  (`remove_1_sqft`, `staircase_profile_1`, `score_5n31`…) and tags stay in GHL as a manual backup
  for when this app is down; the app never writes them, and sending adds nothing to GHL beyond the
  message itself (no tag, note, stage or field). Counts of preliminaries come from Quote Versions
  (Basis, Status, Sent At/By/To), not from the `mobile quote` tag.
- **Customer view (Albert, 2026-10-15).** A switch in the top bar, kept per device in the
  `quote_view` cookie. While on, the server renders no cost, margin, profit, contractor, card rate,
  flags or checks, on every page including the editor: they are not hidden, they are not sent.
  Charge rates, line totals, the discount, HST and payments stay. Any new screen that shows an
  internal figure must take `customerView()` and leave it out.
- **Sending (milestone 4, Albert 2026-10-15).** **Send to customer** on a draft's page sends it
  through GHL (Make 4975508, route `message`): an email with the link and the PDF attached, and/or a
  text with the link; good for 30 days unless staff pick another date. What may be sent and the
  message bodies are in `src/lib/send/plan.ts`; the customer copy, a whitelist with no cost, margin,
  contractor, card rate or internal note, in `src/lib/send/copy.ts`; tested in `tests/send.test.ts`.
  The copy is **frozen on the version** (Customer Copy) and the version is marked Sent, so locked,
  before anything leaves; if neither message goes it returns to Draft. Sending a newer version marks
  older sent ones Superseded, and their links say so. Online acceptance is not built yet.
- **The customer deployment (2026-10-15).** Customer links `/c/<token>` and their PDFs are served by
  a second Vercel project on this folder with `QUOTE_MODE=customer` and a read-only Airtable token,
  never by the staff app (root rule: a public page never shares a deployment with a write token).
  It reads one thing, `src/lib/quotes/customer.ts`, which shows only the frozen copy of a version
  that was really sent. The PDF is drawn by `src/lib/send/pdfDoc.ts` (no dependencies).
- **Service level (Albert, 2026-10-16).** Each option is **Standard** or **Premium** (Quote Options →
  Service Level; blank reads as Standard). Premium is for higher-end clients and needs: labour priced
  from the card (Rate Card Install/Remove/Refinish/Sand/Paint, and Stair Items) is priced at the card
  rate **+15%**; cost is unchanged, so the extra is margin. Materials, disposal, hand-typed lines and
  typed overrides are never changed. The level sets the customer's price; the crew sets our cost.
  The premium price is written into the line's Unit Price Snap when it is priced, so calc.ts and the
  Airtable formulas are unchanged. Rules and the markup: `src/lib/pricing/service.ts`; switching:
  `setServiceLevel()` in `src/lib/editor/model.ts`; tested in `tests/editor.test.ts`.
- **Crew per option (Albert, 2026-10-16).** Pick one contractor for a whole option (Quote Options →
  Crew) and every line that crew has a Rate Card row for moves to them; any single line can still be
  set to someone else by hand, and stays that way when the crew changes ("back to <crew>" undoes it).
  A crew is any contractor the card offers as a choice; work only one contractor is listed for is
  never touched, and a contractor added to the Rate Card appears as a crew by itself (no names in
  code). The picker shows each crew's cost and margin for the option; lines the crew has no rate for
  are marked. The crew sets cost; the price follows the card row (identical across crews except where
  the card itself differs). Rules: `setCrew()` / `crewState()` / `compareCrews()` in
  `src/lib/editor/model.ts`; tested in `tests/editor.test.ts`.
- **HST per material line (Albert, 2026-10-16).** A line in the Materials section has its own HST
  box (Quote Lines → No HST; unticked = HST charged, the default); the quote's Charge HST switch
  covers every other line and never changes a material's. HST = 13% of the taxed lines after the
  same discount, so with every line taxed it is 13% of the subtotal exactly as before. Airtable
  mirrors it: Quote Lines → HST Base Own / HST Base Quote, rolled up on Quote Options, feeding HST.
  The customer page and PDF say "no HST" / "plus HST" on a material that differs from the quote,
  and "HST (13%) on materials" when only materials are taxed. `chargesHst()` in `src/lib/calc.ts`.
- **Swappable material (Albert, 2026-10-16).** A Rate Card row can name a Material Group and the
  Default Material its Titan Rate and Total Cost already include (table Install Materials: Name,
  Group, Cost, Price per unit of the job, Active; read only). On the line the material can be swapped
  for any priced material in the group: one line for the customer, named "work · material". Labour =
  the row less its default; the line = labour (at the service level, so Premium marks up labour only)
  + the chosen material, so the default at Standard is exactly the row. A row whose default has no
  price, or costs more than the row, offers no swap. Contractor and crew changes keep the material.
  Rules: `rateSnap()` / `setMaterial()` in `src/lib/editor/model.ts`; tested in `tests/editor.test.ts`.
- **The customer's conversation (Albert, 2026-10-20).** On the quote page and the editor it is a
  **drawer docked to the right edge**: a tab with the message and photo counts, a click opens a
  panel beside the quote (a wide screen makes room for it, a narrow one is slid over; remembered
  per device; Escape closes). On New quote it is a **card** under the customer once one is picked,
  open; on a wide screen (1200px and up, 2026-10-22) that card sits in a right-hand column beside
  the form and stays in view while the job is priced, by CSS only (`.newq` grid in `globals.css`). Same content: their texts, emails and chats, our replies and sent quotes, and every photo
  they sent in a strip at the top, pinned there while the thread scrolls under it (2026-10-22), so a
  quote is priced from what the customer actually said. Read live
  from GHL each time (`src/lib/quotes/conversation.ts`, a quoter only; the pure reading of GHL's
  message list is `src/lib/conversation/thread.ts`, tested in `tests/conversation.test.ts`),
  stored nowhere, and **read-only: replying stays in GHL** ("Reply in GHL" in the header). A reply
  box would mean the app writing to GHL with a token of its own; if it is wanted, it is its own
  decision, and the natural route is Make 4975508, like sending. The whole thread is shown (Albert,
  2026-10-20): workflow, campaign and activity entries too, drawn lighter and labelled Automated,
  never filtered out. An email opens as its subject and a short peek, "Show full email" expands it
  (`emailPeek()`). A voicemail or call recording plays inline and is never in the photo strip (an
  attachment on a call with no extension is a recording, 2026-10-21); a photo opened full size steps
  to the next with the arrow keys, the on-screen arrows or a swipe. Staff only: the pages leave the card out in Customer
  view, and the customer deployment never has it. Pictures are shown straight from GHL's URLs; one
  the browser cannot load falls back to a link.
- **All quotes (2026-10-15).** One row per quote, its versions folded under it (newest first),
  and a search over name, quote and project number, city, email and phone digits. Grouping and
  search are pure, in `src/lib/quotes/group.ts`, tested in `tests/group.test.ts`.

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
   only, the only reader of `QUOTE_GHL_TOKEN` (used for contacts.readonly, opportunities.readonly,
   conversations.readonly and conversations/message.readonly). The token Albert made (2026-10-20)
   also holds write scopes; the app uses none of them, and the boundary test fails on any write
   verb in that file. A reply feature, if it comes, is a reviewed change to this rule.
2b. **One file sends to Make:** `src/lib/make/client.ts`, `server-only`, the only reader of
   `QUOTE_MAKE_GHL_HOOK` / `QUOTE_MAKE_GHL_KEY`, called only from `src/lib/quotes/start.ts`, `src/lib/quotes/booking.ts`, `src/lib/quotes/link.ts` and `src/lib/quotes/send.ts`.
   Set those two variables only after the scenario is switched on: a request to a scenario
   that is off waits in Make's queue and would run later.
2c. **One path without a sign-in on the staff app:** `/api/booking`, called by Make 3453735 when an appointment
   is confirmed. The proxy lets only that path through (besides signing in); the route and every function in
   `src/lib/quotes/booking.ts` check `QUOTE_BOOKING_KEY` first (constant-time; unset = off). Make
   sends only the contact id and, when GHL has one, the opportunity id; the customer is read from
   GHL, never taken from the request. It writes the Quotes table (and a version 1), and creates a
   GHL opportunity through Make only when the contact had none open and none lost or abandoned in the
   last 90 days (that may be the job coming back: the quote is flagged for staff instead). An
   opportunity GHL sends that isn't open, or isn't in a project pipeline (a STORE order), is ignored.
   It answers `made: true` when the job's folder and CompanyCam project already exist (links on the
   quote, or a CompanyCam URL on the opportunity), and Make then skips making them.
2d. **Customer links live on the customer deployment only.** There the proxy serves `/c/<token>`
   and 404s everything else, and `write()` refuses; on the staff app `/c/` is 404.
   `src/lib/quotes/customer.ts` answers only there and only for a well-formed token, returns the
   frozen copy and nothing live, and is imported only by `src/app/c/`. `tests/boundary.test.ts`
   pins all of this.
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
