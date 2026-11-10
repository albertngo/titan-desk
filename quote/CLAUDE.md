# quote/ — the quoting app

Titan Flooring's quoting tool: one tab per complete option, work-type sections, card rate
vs override on every line, an Analysis tab. Its own Vercel project and its own address,
built from this repo (Albert, 2026-10-11). These rules sit alongside the repo-root
CLAUDE.md; where they differ, this file governs `quote/` and nothing outside it.

## Where things live — index

The full text (98 bullets: data model, GHL, Notion, Make scenarios, pricing, sending, customer
page, booking and more, each with its date and Albert's decision) is in
**`quote/docs/where-things-live.md`**, moved there verbatim on 2026-11-08. Search it
(`grep -n "<topic>" quote/docs/where-things-live.md`) and read the bullet before you change the
behaviour it describes. A new rule goes there, with a line here. A code comment citing
`quote/CLAUDE.md` for one of these bullets (e.g. "What's new") means that file.

- Quotes and rates live in Airtable
- Words (Albert, 2026-10-14)
- GHL owns the customer.
- The copy follows GHL (2026-10-14).
- Where the site address comes from (Albert, 2026-10-15).
- One shared name
- Supabase is used for sign-in only
- `src/lib/calc.ts` is the only place money is computed
- The editor keeps drafts on the device
- Autosave and the Send guard (Albert, 2026-11-05: "grey out the send button if there is an outstanding unsaved version"; "yes build autosa…
- Saving (milestone 3, 2026-10-14).
- Linking (2026-10-15).
- Confirm address (Albert, 2026-10-15).
- Fix address (Albert, 2026-10-21).
- Address arrived (Albert, 2026-10-27: "filled auto").
- Two ways to start a quote (Albert, 2026-10-18).
- Where they found us (Albert, 2026-10-27).
- The preliminary's option is named for what it installs (Albert, 2026-10-31).
- Several options from the quick form (Albert, 2026-10-31).
- Quick form = the preliminary (Albert, 2026-10-15; phone layout 2026-10-18).
- The waterfall: a choice, then its options (Albert, 2026-11-06: "the selection of the common items have the OPTIONS come up when chosen… I…
- Material tied to the install (Albert, 2026-11-06: "for every install option; I can PICK whether there will be materials needed or not… th…
- Moulding is its own section (Albert, 2026-11-06: "Can we have Moulding be its own category; right under Install for the Flooring? So thos…
- Material square feet against the install (Albert, 2026-11-06: "a check for sf of flooring; and sf of install. This should usually fall in…
- Stairs on the preliminary (Albert, 2026-10-18; presets 2026-10-20; Stair Item lines 2026-11-02).
- One standard Stair Item per staircase on the quick form (Albert, 2026-11-07: "from the quick form, lets only ever use those standard line…
- The wording follows the Stair Profile lines (Albert, 2026-11-07: "when in a preliminary; on an option; the description/customer wording s…
- The stair builder (Albert, 2026-10-20).
- Stairs grouped by category, and always one price (Albert, 2026-10-28).
- One wording, one line for the customer (Albert, 2026-11-02: "I don't want to confuse the customer with the different types of steps invol…
- Each Stair Item has its own unit (Albert, 2026-11-04: "an option column for the units name for each stair item… And the rest of the app u…
- A Stair Item's cost is Labor Cost + Material Cost (Albert, 2026-10-31)
- Stairs is its own section again (Albert, 2026-10-18)
- The GHL mobile-quote workflow is retired (Albert, 2026-10-18).
- Follow-up tags (Albert, 2026-10-27).
- Open tracking (Albert, 2026-10-27).
- Customer view (Albert, 2026-10-15).
- Sending (milestone 4, Albert 2026-10-15).
- The email and the text (Albert, 2026-10-22: recreate the GHL "Rough quote is ready" template and improve on it).
- Choosing which options go (Albert, 2026-10-24).
- Options side by side on the customer's page (Albert, 2026-10-31; vault `05_decisions/2026-10-31-quote-options-side-by-side`: "it should s…
- The staff screens' look (Albert, 2026-11-07: "navy, yes make accept secondary").
- A preliminary goes as a range (Albert, 2026-10-27).
- Sent from the person signed in (Albert, 2026-10-22).
- Who worked on a version (Albert, 2026-10-22).
- The customer deployment (2026-10-15).
- Service level (Albert, 2026-10-16).
- Crew per option (Albert, 2026-10-16).
- HST per material line (Albert, 2026-10-16).
- Charge HST is per option (Albert, 2026-11-04: "for the HST application at the bottom; I'd like for it to ONLY apply for the option it is …
- Swappable material (Albert, 2026-10-16; corrected 2026-10-28).
- The customer's conversation (Albert, 2026-10-20).
- Lump sum is the default, always (Albert, 2026-10-22).
- The Private section (Albert, 2026-10-22).
- Accepted price (Albert, 2026-10-22; above the list blocked 2026-11-04, see The price card).
- The price card (Albert, 2026-11-04).
- The customer always sees the discount (Albert, 2026-11-03: "All quote links and PDF should show the client what the discounts are").
- If they accept a price (Albert, 2026-10-22).
- Rooms (Albert, 2026-10-27).
- Site sheet (Albert, 2026-10-28).
- Site sheets from CompanyCam, and the Flooring Site Sheet (Albert, 2026-11-03: "build the sheets from companycam into rooms and flooring l…
- The payment schedule (Albert, 2026-10-27: "update the payment structure to be editable").
- Acceptance (Albert, 2026-10-27: "it is always best to have an accept step").
- Scopes: flooring and stairs on one quote (Albert, 2026-10-28: "For stair quotes, generally I like to keep them separate from the flooring…
- Won (2026-10-27).
- Editing a change is marked (Albert, 2026-10-31: "make it a little bit more obvious").
- Changes after acceptance (Albert, 2026-10-27: "verbal, sent for record").
- The contract is a list of pointers (Albert, 2026-10-30; vault `05_decisions/2026-10-30-quote-contract-from-any-version`).
- Parts and Not offered (Albert, 2026-10-30; vault `05_decisions/2026-10-30-quote-one-working-quote`).
- One working quote (Albert, 2026-10-30; vault `05_decisions/2026-10-30-quote-one-working-quote`).
- Put on contract, swap from any version, schedule restaged (Albert, 2026-10-30; step 2 of the contract).
- What an option can add follows its scope (Albert, 2026-10-30: "For stairs, the only options should be from stair items. And the select op…
- After the first acceptance, everything is for the record (Albert, 2026-10-31; vault `05_decisions/2026-10-31-quote-changes-for-record`).
- Invoices and receipts (Albert, 2026-10-30).
- The HST flips after a number was issued (Albert, 2026-10-31,
- An overpayment can read as Paid in full (Albert, 2026-10-31: "in case it backfires on us, I would rather it be paid in full").
- Photos (Albert, 2026-10-30: "display all those photos with their proper timestamps and descriptions, mirroring company cam itself").
- Payout cards (Albert, 2026-11-04: "we have to also send the contractor a payout form… select the final sent options and summarize for the…
- Typed lines saved for next time, and logged (Albert, 2026-11-01: "When we add custom items and the quote ends up being SENT… make it so t…
- All quotes (2026-10-15).
- Quote Description (Albert, 2026-11-03: "When we are quoting lets say; AMICA Stephen. It is ALWAYS at 200 Kenneth… But a different unit; o…
- Value, Follow up and the strip on All quotes (Albert, 2026-11-07: "Build value, follow up filter and summary strip").
- Follow up (Albert, 2026-11-07; vault `05_decisions/2026-11-07-quote-follow-up-worklist`: "a place where we can 'followup'… a brief or a s…
- The follow-up score (Albert, 2026-11-09; vault `05_decisions/2026-11-07-quote-follow-up-worklist`, addendum 2026-11-09: "handle the preliminaries automatically; notify IF human intervention is best").
- No section totals for the customer (Albert, 2026-11-07: "can we keep the totals of each Section not shown? it has too many numbers if too…
- A preliminary's stairs option goes as its words only (Albert, 2026-11-07: "For preliminary stairs; can we NOT put ANY line items in the c…
- Flooring rates by basis (Albert, 2026-11-07: "On a preliminary; Material section: Rate + qty shown; Other sections: qty only shown. On a …
- Company files (Albert, 2026-11-07: "an option to download the Site Sheets (Flooring, Stairs) and show the latest version… inside the What…
- Report a bug (2026-10-28).
- Sand steps → painted risers and stringers only (Albert, 2026-11-06: "Logic to not allow for glue and stain stringers when sanding steps! …
- Every new line starts at 1 (Albert, 2026-11-06: "All items always start off with value of 1 (for everything) unless otherwise edited or e…
- The material's math is shown (Albert, 2026-11-06: "sf typed + wastage % = actual sqft. Total is not editable. only the sf typed and wasta…
- The material first when it costs the deposit (Albert, 2026-11-06: "if the material cost is above the 35% or above the deposit requirement…
- The Send card in the editor (Albert, 2026-11-06: "Send option card WITHIN the 'edit' screen is also available").
- A stairs option is one section, Stairs: no Private, no separate Other (Albert, 2026-11-06: "any additional work PRIVATE section should ne…
- Private is back on stairs options, staff only (Albert, 2026-11-06, later the same day: "Should we bring back the private section? Where f…
- Two fees every option starts with (Albert, 2026-11-06), `src/lib/quotes/fees.ts`.
- Stair Site Sheet v7 (Albert, 2026-11-06/07).
- The Send card starts the way the last version went (Albert, 2026-11-06: "send card should also show and default to the 'breakdown' or 'lu…

## Hard rules

1. **One file talks to Airtable:** `src/lib/airtable/client.ts`. It alone reads
   `QUOTE_AIRTABLE_TOKEN`, it is `server-only`, and the token never reaches a browser.
   `tests/boundary.test.ts` enforces all of this.
2. **Writes go to the four quote tables, and Invoices and Receipts (2026-10-30), only.** Since 2026-10-14 the client can create
   (POST) and update (PATCH) records, never delete or replace, and `write()` refuses any
   table outside `WRITABLE_TABLES` (Quotes, Quote Versions, Quote Options, Quote Lines, Invoices, Receipts).
   Only the files listed in the boundary test's `WRITERS` may call it. Never a write to the
   catalogue from this app. **One exception for the Rate Card and Stair Items (Albert, 2026-11-01):**
   `createReviewRecord()` in the client may CREATE a row there (`REVIEW_TABLES`), and only one switched off and
   marked Needs Review (`REVIEW_MARKS`: Active unticked, Import Status / Review Status = Needs Review), without
   typecast; never an update, never a delete. Only `src/lib/quotes/customItems.ts` calls it. The boundary test pins
   all of this. **App Settings (Albert, 2026-11-10):** the Settings page's one table, in `WRITABLE_TABLES`, written only by
   `src/lib/settings/settings.ts` (`saveSetting()`, admins only, every change appended to the row's Log). It holds switches and
   dials only; keys, tokens and webhook addresses stay in Vercel.
2a. **One file talks to GHL, and only reads:** `src/lib/ghl/client.ts`, `server-only`, GET
   only, the only reader of `QUOTE_GHL_TOKEN` (used for contacts.readonly, opportunities.readonly,
   conversations.readonly and conversations/message.readonly; since 2026-10-27 users.readonly, to tag
   the sender on an open-tracking comment, and since 2026-11-04 to text from the sender's own GHL number). The token Albert made (2026-10-20)
   also holds write scopes; the app uses none of them, and the boundary test fails on any write
   verb in that file. A reply feature, if it comes, is a reviewed change to this rule.
2b. **One file sends to Make:** `src/lib/make/client.ts`, `server-only`, the only reader of
   `QUOTE_MAKE_GHL_HOOK` / `QUOTE_MAKE_GHL_KEY`, called only from `src/lib/quotes/start.ts`, `src/lib/quotes/booking.ts`, `src/lib/quotes/link.ts`, `src/lib/quotes/send.ts`,
   `src/lib/quotes/address.ts` (Address arrived: the contact's street only, never a site on the opportunity),
   `src/lib/quotes/activity.ts` (internal comments, and the one-off send notes as contact notes), `src/lib/accept/record.ts` (acceptance: Won,
   cancel, and the acceptance messages), `src/lib/quotes/billing.ts` (the invoice or receipt email) and `src/lib/quotes/followup.ts`
   (Follow up's Lost, Postpone and comments; since 2026-11-09 a measured quote's follow-up text or email, see 2c''').
   Set those two variables only after the scenario is switched on: a request to a scenario
   that is off waits in Make's queue and would run later.
2c. **A path without a sign-in on the staff app:** `/api/booking`, called by Make 3453735 when an appointment
   is confirmed. The proxy lets only it and `/api/activity` (2c') through (besides signing in); the route and every function in
   `src/lib/quotes/booking.ts` check `QUOTE_BOOKING_KEY` first (constant-time; unset = off). Make
   sends only the contact id and, when GHL has one, the opportunity id; the customer is read from
   GHL, never taken from the request. It writes the Quotes table (and a version 1), and creates a
   GHL opportunity through Make only when the contact had none open and none lost or abandoned in the
   last 90 days (that may be the job coming back: the quote is flagged for staff instead). An
   opportunity GHL sends that isn't open, or isn't in a project pipeline (a STORE order), is ignored.
   **Booked somewhere else (Albert, 2026-10-31, "go with flag"):** when the quote a booking matches is
   already Confirmed at a different street address than the contact's now (`bookedElsewhere()` /
   `sameStreet()` in `src/lib/link/booking.ts`: case, punctuation and Crt/Court don't matter, a unit
   does), the booking is probably a new project for the same customer. That quote, its site and its
   opportunity are left alone; a new quote is started at the new address, unlinked and noted with both
   addresses, and no opportunity is made. Make still makes its folder and CompanyCam project. Staff then
   create the new opportunity and link it, or, if it was the same job at a new address, fix the address
   and delete the new quote. A booking never moves a confirmed site.
   It answers `made: true` when the job's folder and CompanyCam project already exist (links on the
   quote, or a CompanyCam URL on the opportunity), and Make then skips making them.
2c'. **A second path without a sign-in: `/api/activity` (2026-10-27)**, open tracking, called by the
   customer deployment and the daily summary run. The route and every function in
   `src/lib/quotes/activity.ts` check `QUOTE_ACTIVITY_KEY` first (constant-time; unset = off). It writes
   only the tracking fields of Quote Versions and posts only internal comments; the version is found by
   the link's token, never by anything else in the request.
2c''. **A third path without a sign-in: `/api/accept` (2026-10-27)**, the customer's Accept, called by
   the customer deployment's server, never by a browser. The route and every function in
   `src/lib/accept/accept.ts` check `QUOTE_ACCEPT_KEY` first (constant-time; unset = off). The version is
   found by the link's token and the acceptance is built from its frozen copy: nothing the request says
   about prices or totals is used. All the writes are in `src/lib/accept/record.ts`, reached only from
   `accept.ts` and from `src/lib/accept/staff.ts` (a signed-in quoter: on their behalf, retry, cancel).
   On the customer deployment `src/lib/quotes/acceptClient.ts` is the only reader of the key; it reads no
   Airtable and is reached only from `src/app/c/`.
2c'''. **A fourth path without a sign-in: `/api/followups` (Albert, 2026-11-09: "I like the app sending out the
   messages… make this a norm for the measured quote").** Stage 2 of the app's measured follow-ups, called hourly by
   `.github/workflows/quote-followups.yml`. The route and `runAutoFollowUps()` in `src/lib/quotes/followup.ts` check
   `QUOTE_FOLLOWUP_KEY` first (constant-time; unset = off), and it sends nothing unless `QUOTE_AUTO_FOLLOWUPS` is exactly
   `on`, which is Albert's switch, flipped only as a dated vault decision. It sends only a text or an email to the
   customer (`deliver()`), only rows `autoBlock()` in `src/lib/followup/autosend.ts` clears (measured, due, a current
   brief, a check-in or nudge, nothing unanswered, no flag, under $25k, 9am to 7pm Mon to Sat, 2 days apart, 4 at
   most), and only drafts `checkDraft()` passes (no dollar amount the quote doesn't carry). Stage 1 is the signed-in
   Send button (`sendFollowUp()`), from the person signed in. Since 2026-11-09 the same run first rewrites up to 10
   stale briefs (written before today or before something new happened) for due and upcoming quotes, whatever the
   switch; that writes only Quotes → Follow Up. `tests/boundary.test.ts` pins all of this.
2d. **Customer links live on the customer deployment only.** There the proxy serves `/c/<token>`
   and 404s everything else, and `write()` refuses; on the staff app `/c/` is 404.
   `src/lib/quotes/customer.ts` answers only there and only for a well-formed token, returns the
   frozen copy and nothing live, and is imported only by `src/app/c/`. The only other thing `src/app/c/` may
   reach is `src/lib/activity/relay.ts`, which reports opens to the staff app and reads no Airtable, and, for
   acceptance, `src/lib/quotes/acceptClient.ts` and the pure rules it needs (accept plan, terms, settings,
   schedule). `tests/boundary.test.ts` pins all of this.
2e. **One file talks to Claude (2026-10-28):** `src/lib/anthropic/client.ts`, `server-only`, the only reader of
   `QUOTE_ANTHROPIC_KEY` (staff deployment only) and the only file naming `api.anthropic.com`; one request,
   called only from `src/lib/quotes/sitesheet.ts`, which writes the Quotes table only (the Site Sheet field and,
   through `uploadAttachment()` in the Airtable client, the Site Sheet Photos field; since 2026-11-03 also the Flooring
   Sheet and Flooring Sheet Photos fields; since 2026-11-04 `src/lib/quotes/payouts.ts` uploads to Payout Cards). The Airtable client's
   third request, `uploadAttachment()`, runs the same table and deployment checks as `write()`.
2f. **Notion payments are read in one file (2026-10-30):** `src/lib/notion/payments.ts`, `server-only`, the only reader
   of `QUOTE_NOTION_PAYMENTS_TOKEN` (a Notion internal integration with read content only, shared with the Master
   Payments Log alone, staff deployment only), one request (a query of that log), reached only from
   `src/lib/quotes/billing.ts` and, since 2026-10-31, `src/lib/quotes/send.ts` (a change's paid so far). `src/lib/bug/notion.ts`
   is the only other file that talks to Notion.
2g. **One file talks to CompanyCam, and it reads plus adds payout cards (2026-10-30; one write since 2026-11-04):** `src/lib/companycam/client.ts`, `server-only`,
   one request function, the only reader of `QUOTE_COMPANYCAM_TOKEN` (staff deployment only; refuses on
   the customer one) and the only file naming `api.companycam.com`. A CompanyCam access token is not scoped, so this
   file is the limit: one project and its photos. It is reached only from `src/lib/quotes/companycam.ts`, which only
   the quote page and (since 2026-11-03) `src/lib/quotes/sitesheet.ts` import. Making projects stays Make's. **Site sheet
   photos (2026-11-03):** the one request also downloads a photo's image, without the token (the token goes only to
   `api.companycam.com`), and only from an address CompanyCam's own answer gave for a photo on the quote's project, never
   one a browser sent. **The one write (Albert, 2026-11-04, payout cards):** `addProjectPhoto()`, a POST that the request
   refuses for any address but `https://api.companycam.com/v2/projects/<digits>/photos`; never an update, a delete or a
   project. It is reached only through `addPayoutPhoto()` in `src/lib/quotes/companycam.ts` (the quote's own project,
   tagged Payout), called only from `src/lib/quotes/payouts.ts`, which reads the project from the quote's record, never
   from a browser. `tests/boundary.test.ts` pins all of this.
3. **Staff is not enough.** Only emails on `QUOTE_ALLOWED_EMAILS` get in. The proxy checks
   it and every loader in `src/lib/quotes/load.ts` and `src/lib/quotes/start.ts` checks again
   (`requireQuoter()`). An empty list lets nobody in.
4. **No real data in the repo.** It is public. Tests use invented numbers; never commit a
   real customer, address, rate or cost — not as a fixture, not in a comment.
5. **Never import from `web/` or from `titan-agents`.** Copy the small thing instead; a
   shared folder comes when a third app needs it.
6. **The Excel template stays the fallback.** If Airtable or this app is down, Albert
   quotes in Excel. Nothing here may make that harder.
7. **Every change gets a What's new entry (Albert, 2026-10-27).** Any work that changes what
   staff or customers see, or what the app does, adds one entry at the **top** of `CHANGES` in
   `src/lib/changes.ts`, in the same commit: today's date (Toronto), `new` / `changed` / `fixed` /
   `removed`, a short title, and a line or two of details in plain words for the person using the
   app (what it does, where to find it), never code. Append only: an earlier entry is never
   rewritten; a reversal is its own new entry. The **What's new** button on the Quotes page opens
   it at `/changes`. Pure refactors, tests and lint fixes need none. `tests/changes.test.ts` keeps
   it dated and newest first.
8. **No em dashes in the app's words (Albert, 2026-11-04: "There should be NO em-dashes on any of the
   wordings from anywhere").** Nothing under `src/` contains one (`tests/emdash.test.ts` fails on any,
   comments included; `pdfDoc.ts`'s font map is the one exception), and `noEmDash()` in `copy.ts` takes
   them out of words typed into Airtable before they reach a customer copy.

## Commands

```
cd quote
npm install
npm run dev          # http://localhost:3001 (needs .env.local, see README.md)
npm run lint && npm run typecheck && npm test
```
