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
  nowhere else, except that a blank contact is filled from the customer's own message (Address
  arrived, 2026-10-27, below): the contact's address is where the next appointment is (the booking
  texts read it too). It reaches the job's opportunity at three moments only: GHL's own workflow fills a
  blank Project Address when an opportunity is created (unconfirmed); booking (`/api/booking`)
  copies the contact's address onto that job as the confirmed site; **Confirm address** on a quote
  that Address arrived (or anything else) left Unconfirmed. A confirmed site never changes because the contact did;
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
- **Address arrived (Albert, 2026-10-27: "filled auto").** A quote booked before anyone had the
  address says No address yet; the booking workflow then texts "Just to make sure we have the right
  address, could you send it to me here if you haven't already?" (`ADDRESS_ASK`), a person asks in
  their own words, or the customer just texts it. When the quote list or a quote page opens, after it
  has drawn, `src/components/AddressScan.tsx` asks `scanAddresses()` (`src/lib/quotes/address.ts`) to
  read the messages of quotes still without an address (not won, with a GHL contact; the list takes
  the newest ten started in the last 60 days, at most once a minute). A contact that already has an
  address is copied onto the quote, as opening it would. Otherwise, when exactly one address can be
  read (`findAddress()` in `src/lib/link/addressReply.ts`, tested in `tests/addressReply.test.ts`), it goes on the blank
  GHL contact through Make's link route (`buildContactAddress()`: the street as staff type it,
  "55 Elm Cres #4", and a city or postal code only where the contact has none) and on the quote as
  **Unconfirmed**, with a dated note saying which message it came from. A banner says what was filled;
  staff check it and press **Confirm address**, which is what puts it on the opportunity. Reading rules:
  messages from 30 days before the quote started; a text or chat any time, an email only after we
  asked and only its top lines (a reply once carried our newsletter footer and old showroom address);
  an address we sent them first is ours, never the site (plus `QUOTE_COMPANY_ADDRESS`); the reply to
  our latest ask wins; two different addresses, a street with no number, or a customer with two quotes
  waiting is held for a person and nothing is written; a unit, city or postal code is kept only when
  typed. Both the contact and the quote are read again right before the write, so only a blank is
  ever filled. An unlinked quote waits until it is linked (the link route needs the opportunity). The
  Excel INQ/QE sheets made at booking are left as they are (Albert, 2026-10-27).
- **Two ways to start a quote (Albert, 2026-10-18).** The front page has **+ New quote** (`/new`:
  customer with the site address folded in, then timeline; v1 is *Measured* and opens empty in the
  editor) and **+ Preliminary quote** (`/new?kind=preliminary`: the job first, then customer, then
  timeline, with the step numbers counted; v1 is *Preliminary* with one priced option, opened for
  review). The request says `kind: "measured"` for the first; anything else is a preliminary
  (`parseNewQuote()` in `src/lib/link/newQuote.ts`).
- **Where they found us (Albert, 2026-10-27).** A preliminary's customer step asks **Where did they
  find us?** from a fixed list (`ORIGINS` in `src/lib/link/origin.ts`). The pick is the most
  trusted answer: it goes into the GHL contact's **Quote Origin** custom field (`CONTACT_ORIGIN_FIELD`),
  the contact's **Source** and the opportunity's **Source**, replacing what is there, unless that field
  already holds one of the exact options, which is kept (`replaceable()`). The contact and the linked
  opportunity are read fresh from GHL first; a contact whose Quote Origin is already an option shows it
  instead of asking. It rides the same Make request
  that creates the contact or opportunity (`buildGhlRequest()` in `src/lib/link/ghlRequest.ts`), so no
  GHL workflow and no Make change. Optional; a measured quote does not ask. Tested in
  `tests/ghlRequest.test.ts` and `tests/link.test.ts`.
- **Quick form = the preliminary (Albert, 2026-10-15; phone layout 2026-10-18).** "Job", step 1
  of a preliminary, replaces the GHL "Preliminary Mobile Quote" form and its workflow: pick flooring
  work from short lists, type square footage, add staircases, see a live estimate. Laid out for a
  phone: Flooring, then Stairs, then anything else; each work group folds to a one-line summary;
  short lists are chips; "Same as install" copies the square footage onto Remove and Material rows;
  the first Baseboards row in linear feet defaults to **a third of the install square feet, rounded
  to the nearest foot** (Albert, 2026-10-22), follows the install while it was never typed, and keeps
  what staff type, with "⅓ of install" to snap back (`baseboardDefault()` / `baseboardFollow()` in
  `plan.ts`); Baseboards allows up to three rows (2026-10-22: baseboard in one area, shoe only in
  another) and only the first follows the install, so a second never double-counts; the form's
  **Additional cost** becomes a Private line (2026-10-22), so the customer sees it as the one
  rolled-up "Additional work" row and never as an itemised line;
  every row shows its rate and its total beside the selection, priced the same way the quote will
  be (`choiceRate()` / `rowTotal()` in `plan.ts`); the estimate and Create stay on screen
  (`src/components/QuickWork.tsx`). The flooring choices are
  rows in the Airtable table **Quick Quote Choices** (`QUICK_TABLE`), each pointing at Rate Card
  rows or, for materials, a standard catalogue **SKU** (text, not a link, so the catalogue's
  schema and its drift check are untouched); staff can pick a different SKU. A material choice is
  priced from its product; a Rate Card row linked beside it is a fallback for when it has no
  product, never a requirement (2026-10-22: the eight Material choices had vanished because each
  also linked an inactive Material row). Prices are never
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
  for when this app is down; the app never writes them. Since 2026-10-27 sending adds one thing to GHL
  beyond the message: the follow-up tag (below); no note, stage or field. Counts of preliminaries come
  from Quote Versions (Basis, Status, Sent At/By/To), not from the `mobile quote` tag.
- **Follow-up tags (Albert, 2026-10-27).** Every send removes both `quote sent: preliminary` and
  `quote sent: measured` from the contact, then adds this version's, through Make 4975508's `tags`
  route (whose filter refuses any other tag). Each tag starts its own GHL workflow, "Quote FU:
  preliminary" / "Quote FU: measured", built in GHL with the tag's removal as the goal and re-entry
  allowed, so a new version restarts its sequence and a measured quote ends the preliminary's; Won,
  Lost and Abandoned end them in GHL. Best effort: a failed tag never stops a send, the result says so.
  Tags in `src/lib/ghl/ids.ts` (`FOLLOW_UP_TAGS`), bodies in `followUpTagBodies()` in `src/lib/activity/track.ts`.
- **Open tracking (Albert, 2026-10-27).** The customer's page reports an open once it has been in view
  for a moment (`SeenBeacon`, `/c/<token>/seen`), so a link preview or a mail scanner never counts; a
  reload within 30 minutes is the same open. Its Download PDF button, when the PDF is offered, asks with
  `?d=1`, so only that counts as a download. The customer deployment cannot write,
  so `src/lib/activity/relay.ts` reports {token, kind, device in words} to the staff app's
  `/api/activity` with `QUOTE_ACTIVITY_KEY`, and `src/lib/quotes/activity.ts` records it on Quote
  Versions (Opened Count, First/Last Opened At, PDF Downloads, an append-only Activity Log). A version's
  **first open** posts an internal comment on the customer's GHL conversation (Make `message` route,
  `type: "InternalComment"`), and a daily run (`.github/workflows/quote-activity-summaries.yml`) posts
  one **summary three days after sending** (opens, devices, last open, PDF downloads, or "not opened
  yet") for every version still Sent, so a replaced one gets none and the new version gets its own.
  On a measured quote both comments tag the contact's assigned user (else the opportunity's, else
  Albert), whoever sent it, and also the sender (their GHL user, by email) when that is someone else
  (Albert, 2026-10-27); a preliminary's are the same notes with nobody tagged, since its
  follow-up is the automation's. Only versions sent since tracking began (Track Activity) get comments.
  The Send card shows the activity once sent, and All quotes has a **Last opened** column (the current version's last open and how many in all) and marks opened versions in each quote's version list (`openedOn()` in `src/lib/quotes/group.ts`); staff opening a
  link from the Send card add `#staff`, which is never counted. Rules in `src/lib/activity/track.ts`,
  tested in `tests/activity.test.ts`.
- **Customer view (Albert, 2026-10-15).** A switch in the top bar, kept per device in the
  `quote_view` cookie. While on, the server renders no cost, margin, profit, contractor, card rate,
  flags or checks, on every page including the editor: they are not hidden, they are not sent.
  Charge rates, line totals, the discount, HST and payments stay. Any new screen that shows an
  internal figure must take `customerView()` and leave it out.
- **Sending (milestone 4, Albert 2026-10-15).** **Send to customer** on a draft's page sends it
  through GHL (Make 4975508, route `message`): an email with the link, and/or a text with the link; good
  for 30 days unless staff pick another date. **The PDF is never in the email (Albert, 2026-10-27).** The
  quote page offers it only when the sender ticks **PDF download on the quote page** on the Send card (off
  by default): unticked, the page has no Download PDF button and the file's address answers 404. The
  choice is frozen on the copy (`CustomerCopy.pdf`, `offersPdf()` in `copy.ts`; a copy frozen before it
  existed keeps its button), the previews follow it (`?pdf=1`), and the email mentions the PDF only when
  it is offered. This replaces the 2026-10-24 **Attach PDF** tick, which had left the button on every page. **A preliminary has no
  good-until date (Albert, 2026-10-22):** it is an estimate, not an offer, so the Send card shows no
  date, the copy's `validUntil` is null, the page, PDF, email and text say nothing about one, and
  the link never expires; a date sent with one is ignored server-side. What may be sent and the
  message bodies are in `src/lib/send/plan.ts`; the customer copy, a whitelist with no cost, margin,
  contractor, card rate or internal note, in `src/lib/send/copy.ts`; tested in `tests/send.test.ts`.
  The copy is **frozen on the version** (Customer Copy) and the version is marked Sent, so locked,
  before anything leaves; if neither message goes it returns to Draft. Sending a newer version marks
  older sent ones Superseded, and their links say so. Accepting it is below (Acceptance, 2026-10-27).
- **The email and the text (Albert, 2026-10-22: recreate the GHL "Rough quote is ready" template and
  improve on it).** `emailMessage()` in `src/lib/send/plan.ts` builds a complete, email-safe document:
  warm paper, the cream header band with the logo (the brand kit's horizontal lockup, Secondary
  Logo 2, shipped in `public/brand/` and served by the customer deployment, which the proxy lets
  through without a sign-in; `QUOTE_LOGO_URL` overrides it; with neither, the company name as a
  wordmark), a serif headline, one card per option (what's included with quantities, the total set
  large, Recommended badge), a pill button, the payment schedule in words on a measured quote, three
  "what happens next" steps (a preliminary links the in-store calendar on its showroom step (the separate in-store button went 2026-10-27, it said the same thing twice) and the
  in-home measurement calendar on its measure step; both GHL calendar ids in `src/lib/ghl/ids.ts`),
  and a transactional footer from the letterhead: no carousel, no click tracking, no unsubscribe. **No HST number** on the page, the PDF or the email (Albert, 2026-10-27: "This is just an estimate, so it's not like a formal invoice"); `QUOTE_COMPANY_HST` is no longer read. The
  accent is the logo's blue (`#283890`), not the old template's terracotta. Tables and inline styles
  only, 600px collapsing under 620px, no web fonts. The text names who is writing, gives the one
  number, puts the link on its own line and stays in GSM-7 (no curly quotes or emoji). **Preview the
  email** on the Send card (`/q/<id>/preview/email`) shows it exactly as GHL will send it. The
  customer page `/c/<token>` carries OpenGraph tags so the link's preview card in a text shows the
  logo (`public/brand/og.png`), never the customer or the amount. **A preliminary always opens "Thanks for
  telling us about your project" (Albert, 2026-10-27):** a preliminary is solely a quote before a
  visit or measurement; one sent after a measure is sent as a measured quote. The "We've already been
  to the home" switch (2026-10-24) is gone.
- **Choosing which options go (Albert, 2026-10-24).** With two or more options, the Send card has a tick
  per option (name, price before HST, any problem), all ticked by default. Only the ticked options go
  into the frozen copy, so the page, PDF, email and text all show the same set, numbered from 1; the
  edit log records "options 1 and 3". Only ticked options are checked, so a half-built option no
  longer blocks a send once it is unticked (`optionProblem()` / `chooseOptions()` in
  `src/lib/send/plan.ts`; the card passes `skipOptions` to `sendProblems()` and applies the per-option
  check live, the send runs everything). The previews and PDF follow the ticks (`?options=`). **The
  email lists three or more options compactly** (names and prices before HST; the detail is on the
  page); one or two get a full card each. Tested in `tests/send.test.ts`.
- **A preliminary goes as a range (Albert, 2026-10-27).** Customers took a preliminary's one number as
  the price, so a measured quote that came in higher read as a change. Everything the customer gets
  (email, text, page, PDF) shows the price before HST as a range instead: **3% under to 10% over, the top
  never more than $3,000 over** (same day, Albert: a measured quote rarely comes in lower, people read a
  range from its low end, and 10% of a big job is too wide), each end rounded outward to a round figure
  ($10 steps under $1,000, $50 under $10,000, $100 above; `priceRange()` in `src/lib/send/copy.ts`), the
  range with HST under it (the same range with the HST on it), no HST amount, no discount rows, and the
  payment schedule in shares of the final price. The words stay the same apart from "a price range" for
  "a rough number" and one passage (`rangeWhy()`): the final price can be expected to fall within it, and
  what the measure confirms decides where in it they land. The text says "$5,250 to $6,000" (an en dash is
  not GSM-7) and stays at two segments. The range is frozen on the copy (`CopyOption.range`), so a
  preliminary sent before this keeps its one number. **Price shown** on the Send card picks *Range* (the
  default, always) or *Exact price* (same day, Albert: "an option to give the customer no range and just
  the quote"), which sends the one number as a rough total, as before; the edit log says "exact price, no
  range". The request says `range: false` for that; anything else is the range. **A preliminary is always
  a lump sum** (same day): the breakdown choice is not offered and `customerCopy()` ignores it, since line
  prices would add up to the one price. The quote page, its Customer view and the editor still show the
  exact price; that is fine (Albert: in the store with us, the range is in the past). Tested in
  `tests/send.test.ts`.
- **Sent from the person signed in (Albert, 2026-10-22).** The email goes out from the quoter's own
  address through GHL's `emailFrom`: tried as "Albert @ Titan Flooring <albert@…>" (the From-name
  convention GHL's own emails use), then the bare address, then GHL's default sender, so a sender GHL
  refuses costs a retry and never the send; the Send card says which address will be used and the
  result says if it fell back. Only an address on the letterhead's domain (`QUOTE_COMPANY_EMAIL`) is
  offered, because GHL sends only from a domain it has verified. The person comes from the Microsoft
  sign-in (`requireQuoterPerson()` in `src/lib/auth.ts`: email plus display name; the first name
  signs the email and the text, `firstNameOf()` in `src/lib/quotes/history.ts`; a shared box like
  info@ signs as the company). Rule: `emailFromFor()` in `plan.ts`, tested in `tests/send.test.ts`.
  Make 4975508 forwards the message body verbatim, so nothing changed in Make.
- **Who worked on a version (Albert, 2026-10-22).** Quote Versions carries **Created By (app)**,
  **Last Edited By**, **Last Edited At** and an append-only **Edit Log** (one line per save, new
  version, quick-form fill or send: Toronto time, the signed-in email, what changed, e.g. `saved: 2
  lines changed, 1 line added`). Written by the app in the same update as the save, never by hand;
  Airtable's own last-modified fields would name the app's token for everyone. The quote page shows a
  **History** card, newest first, staff only. Pure helpers in `src/lib/quotes/history.ts`, tested in
  `tests/history.test.ts`.
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
  stored nowhere (Address arrived reads it too and keeps only the one address it found and a note line), and **read-only: replying stays in GHL** ("Reply in GHL" in the header). A reply
  box would mean the app writing to GHL with a token of its own; if it is wanted, it is its own
  decision, and the natural route is Make 4975508, like sending. The whole thread is shown (Albert,
  2026-10-20): workflow, campaign and activity entries too, drawn lighter and labelled Automated,
  never filtered out. An email opens as its subject and a short peek, "Show full email" expands it
  (`emailPeek()`). A voicemail or call recording plays inline and is never in the photo strip (an
  attachment on a call with no extension is a recording, 2026-10-21); a photo opened full size steps
  to the next with the arrow keys, the on-screen arrows or a swipe. Staff only: the pages leave the card out in Customer
  view, and the customer deployment never has it. Pictures are shown straight from GHL's URLs; one
  the browser cannot load falls back to a link.
- **Lump sum is the default, always (Albert, 2026-10-22).** The customer sees what the work includes
  and one price for the project, **no line price or breakdown**: counted lines keep their words and
  lose unit price and amount; only Install, Removal, Prep and Materials lines keep a quantity, for
  clarity about the scope (`LUMP_QTY_SECTIONS` in `calc.ts`); sections lose their total; the totals
  block shows price before HST, HST and total with the payment schedule and no discount rows (the
  discount is in the price); optional add-ons keep their price, since they are not in it; the
  Private section's roll-up row is not shown at all, its amount being inside the one price. **The
  choice is made when sending**, on a measured quote only (a preliminary is always a lump sum,
  2026-10-27): the Send card offers *Lump sum only* (default) or *Send breakdown*,
  the preview and PDF links follow the choice (`?itemised=1`), and the send writes it to Quote
  Versions → **Itemised Pricing** in the same update as the frozen copy (`pricing: "lump" |
  "itemised"` on the copy; one with neither was frozen before and is itemised). The editor has no
  switch. The quote page's Customer view shows the lump sum unless the version was sent itemised;
  the editor in Customer view does not hide line prices.
- **The Private section (Albert, 2026-10-22).** A section after Other in the editor (Quote Lines →
  Section `Private`, a choice added that day) for costs the customer is billed for but not shown,
  and for cost-only lines. Its lines are priced and counted like any other, in every total, the
  margin and the checks; nothing changes in `calc.ts` or Airtable's formulas. On everything the
  customer gets (page, PDF, email) and in Customer view, the included ones roll up into **one row in
  Other** named by the option (Quote Options → **Private Line Name**, blank = "Additional work") with
  their total and no quantity or unit price, so the customer's lines still add up to the subtotal;
  a private line priced at zero is cost only and never shows at all. Never a hidden amount: the
  customer-copy whitelist in `copy.ts` does the roll-up and `tests/send.test.ts` pins that no
  private description or cost reaches the copy. `PRIVATE_SECTION` / `privateRollup()` in `calc.ts`.
- **Accepted price (Albert, 2026-10-22).** Under each option's overview in the editor, **Accepted
  price, before HST** takes the amount the customer agreed to and sets the quote's discount so that
  option lands on it (`setAcceptedPrice()` in `src/lib/editor/model.ts`, tested). The discount is one
  per version (Quote Versions → Discount Rate), so every option follows it; it is worked out from the
  option it was typed on. **Above the list price** (later the same day) the difference goes in as a
  private line, "Accepted price adjustment", which the customer sees as the Private section's one row
  in Other, and the discount is cleared; the line is updated in place and removed again when a price
  at or below the list is typed (rename it and it is an ordinary private line). **$ off** beside the
  box takes the discount in dollars (`setDiscountAmount()`), and **Discount %** in the terms still takes
  a percent. **Discount reason** (Quote Versions → Discount Reason, 2026-10-22) is the customer's
  words for why, printed beside the Discount row on the page and the PDF (`discountLabel()` in
  `copy.ts`); it is part of the frozen copy and the save fingerprint.
- **If they accept a price (Albert, 2026-10-22).** The Analysis tab opens with a card where staff type
  the pre-tax amount the customer agreed to, or a discount %, and see the discount it implies against
  the list price and the cost, profit and margin left, beside the quote as it stands. Analysis only:
  nothing is saved and the quote's discount is not changed; applying it is still an edit. Staff only:
  the server never renders it in Customer view, so cost never reaches that page. Pure maths in
  `src/lib/pricing/accepted.ts` (the same `optionTotals()` as every quote), tested in `tests/accepted.test.ts`.
- **Rooms (Albert, 2026-10-27).** A **Rooms** tab on the quote page, beside Analysis: a manual log of
  what was measured on site, room by room (name, level, laser / Moasure / tape, total square feet,
  linear feet, the floor there now, notes). Two measurements per room, whichever way it was measured:
  its total square feet and, beside it, its linear feet; no length or width (Albert, same day). It is
  kept on the quote, **Quotes → Rooms** (`QUOTE.rooms`,
  JSON written by the app only), so every version shows the same rooms. **A log only:** nothing prices,
  checks or changes a quote from it, and the lines' "Area / room" text is untouched; checking a quote
  against the rooms is a later decision. One **Save rooms** button, `saveRooms()` in
  `src/lib/quotes/rooms.ts` (a writer, Quotes table only), refused if the field changed since the page
  opened, so one person's rooms never overwrite another's; the server cleans what the browser sends.
  Text in the field the app didn't write is shown, never guessed at, and saving replaces it. Staff only:
  Customer view has no tab and the customer deployment never reads it. Pure rules in
  `src/lib/rooms/log.ts`, tested in `tests/rooms.test.ts`.
- **The payment schedule (Albert, 2026-10-27: "update the payment structure to be editable").** One
  per version, in the editor's terms: presets **35 / 35 / 30** (the default, stored as nothing, so an
  untouched version's Quote Versions → Payment Schedule stays blank), **25 / 25 / 25 / 25**, **50 / 50**,
  and the **material deposit**; then any stage's name, share, "when" and how it is paid (by e-transfer,
  handed to the PM on site, or not said) can be changed, which makes it Custom. The first stage is the
  deposit; the last is always **the balance**, so a schedule always comes to 100%. A share is a percent
  of the total, or of what is left after a material deposit or a fixed amount. **The material deposit**
  is suggested when some priced work carries no HST and there is material: the HST-bearing material
  with its HST (all the material if none carries HST) by e-transfer, the rest 50 / 50 on the first day
  and within 48 hours of completion, handed to the PM on site. The customer's words give the amount and
  how to pay, never why (Albert, same day). Frozen on the copy (`CopyOption.schedule`, `CustomerCopy.paymentSchedule`)
  and drawn on the page, the PDF, the email ("Nothing is final until the deposit is in…") and the staff
  sidebar. Stage amounts are money, so they are in `calc.ts` (`stageAmounts()` / `restageAmounts()` /
  `materialsDeposit()`); the default gives exactly payment1 / payment2 / paymentFinal, and Airtable's
  Payment 1 / 2 / Final stay the default split, so the parity check is unchanged. A send is refused when a
  stage would be negative or the deposit nothing. Rules: `src/lib/pricing/schedule.ts`, tested in
  `tests/schedule.test.ts`.
- **Acceptance (Albert, 2026-10-27: "it is always best to have an accept step").** Only a **measured**
  version out with the customer and still good (Sent, not past Valid Until, not superseded, not a change)
  can be accepted; a preliminary is an estimate. **On the customer's link** an Accept panel under the
  quote: pick the option, tick any optional add-ons (they join at exactly the price shown, HST on the
  ones that carry it), see the total and deposit follow, tick the **Project Expectations**, type their name.
  The Project Expectations come from Albert's Word doc ("pull from the file every turn to create the
  PDF"): Make's "Project Expectations → PDF" saves each new version of it as a row of **Terms Versions**
  (Name, Modified At, PDF, Source File Id; read only, never edited), and the newest row is the one a
  customer agrees to today, named by the day it was saved ("updated October 27, 2026"). The customer's
  link serves it at `/c/<token>/Titan-Flooring-Project-Expectations.pdf`, fetched fresh from Airtable's
  file host (the attachment address expires): once accepted, the version agreed to. The Accept carries the
  row it showed, and a newer one since means "reload and review them" (`src/lib/accept/live.ts`,
  `src/lib/accept/terms.ts`). **In
  store**, staff press **Accept with customer** on the quote page, which opens the same link with
  `?store=1` on the tablet, where a drawn signature is also taken (an SVG path in a 1000 × 300 box,
  printed on the PDF). **For them**, staff may record a yes in writing (a signed paper, an email) with a
  reason saying where it is. The record (Quote Versions → **Acceptance**, JSON; **Accepted Option**;
  **Accepted At**) holds who, when, how, the option, the add-ons, the totals, the schedule on the accepted
  total, the Project Expectations row and its date, and the signature; the version becomes **Accepted** and the quote's
  **Contract Version** points at it; other sent versions are Superseded. Then the **hand-off**: the GHL
  opportunity to **2. Project Won** and status **won** in one request (GHL's won workflow fires on either:
  Make 3710214 makes the Notion project and posts to WhatsApp), valued at the **accepted total with HST**
  (Notion's Value Approx and balance owing are tracked against it), through Make 4975508's `link` route
  (`buildWon()` in `src/lib/link/ghlRequest.ts`; the stage is found by name, `wonStageId()`); then the
  **acceptance email** (the stamped accepted PDF and the Project Expectations attached; the one deposit
  request: the amount, "e-transfer to `QUOTE_ETRANSFER_EMAIL` and put Q-1234 in the message"; the PM sets
  the date) and the text, by the channels the quote went out by. GHL's own on-win deposit text is switched
  off when this goes live. The yes is written first and stands whatever happens after: a failed hand-off
  is kept on the record and staff **Retry** it; **Cancel acceptance** (with a reason) sets the version
  Lost and the opportunity lost and leaves the Notion project to a person. The customer's link then shows
  the accepted copy (`acceptedCopy()`: the one option, ticked add-ons as Added), the deposit and how to
  pay, and the stamped PDF. **One switch:** Quote Settings → **Online Acceptance**. Ticked is the go-live;
  unticked turns the Accept panel, the "press Accept" line in the email and the staff Accept card off at
  once, with no redeploy (read within a minute; anything that can't be read reads as off). Also off until
  Terms Versions has a PDF and `QUOTE_ETRANSFER_EMAIL`, `QUOTE_ACCEPT_KEY` and `QUOTE_STAFF_URL` are set. Rules: `src/lib/accept/plan.ts`; carried out by
  `src/lib/accept/record.ts`; tested in `tests/accept.test.ts`.
- **Won (2026-10-27).** When an accepted quote opens, it reads its opportunity for the PP number and the
  Notion page Make 3710214 writes back after making the project (opportunity fields
  `OPP_FIELDS.projectNumber` and `ACCEPT_FIELDS.notionProjectUrl`), fills them in (blanks only; a PP
  number is never overwritten) and the accepted version becomes **Won**. It keeps looking until it has both (Notion page links are notion.so, notion.site or app.notion.com). Any linked quote without a CompanyCam link copies the opportunity's (2026-10-27: a quote started in the app and never booked has none of its own). All quotes files a quote under
  **Accepted** (yes, no PP number yet) or **Won** (has one). Rule: `projectPickup()` in `src/lib/link/refresh.ts`.
- **Changes after acceptance (Albert, 2026-10-27: "verbal, sent for record").** The accepted version
  stays frozen. **Make a change** on the contract version starts a new version of the same quote,
  numbered (Quote Versions → **Change No** 1, 2, …): only the accepted option, its ticked add-ons now part
  of the work, the others gone, and a schedule where every agreed stage keeps its dollars and the final
  payment takes the difference (`fixedSchedule()`). Staff edit it as usual; the editor shows how far it
  moves the contract's total. **One change open at a time (2026-10-28):** Make a change reopens a draft change instead of starting
  another, and numbers count only sent changes (`changeSlot()` in `savePlan.ts`). A change and the accepted
  version are never copied by **Save as new version** (`newVersionRefusal()`; the editor hides it): a copy would
  go out as a fresh quote to accept. Sending it freezes a **What changed since <date>** block on its copy
  (`src/lib/change/diff.ts`: lines added, removed and changed, matched by section and wording; line amounts
  only on an itemised quote) and the customer gets the full updated quote with that box at the top, on
  the page, the PDF, the email and the text: no good-until date, nothing to accept or approve, no
  follow-up tag. It becomes the quote's Contract Version, older changes are superseded, the accepted link
  points at it, and GHL's value follows the new total with HST (`buildContract()`). The Project
  Expectations are to say (Albert rewords the doc before go-live) that a change agreed in person or by
  phone is confirmed by this updated quote.
  Tested in `tests/change.test.ts`.
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
   conversations.readonly and conversations/message.readonly; since 2026-10-27 users.readonly, to tag
   the sender on an open-tracking comment). The token Albert made (2026-10-20)
   also holds write scopes; the app uses none of them, and the boundary test fails on any write
   verb in that file. A reply feature, if it comes, is a reviewed change to this rule.
2b. **One file sends to Make:** `src/lib/make/client.ts`, `server-only`, the only reader of
   `QUOTE_MAKE_GHL_HOOK` / `QUOTE_MAKE_GHL_KEY`, called only from `src/lib/quotes/start.ts`, `src/lib/quotes/booking.ts`, `src/lib/quotes/link.ts`, `src/lib/quotes/send.ts`,
   `src/lib/quotes/address.ts` (Address arrived: the contact's street only, never a site on the opportunity),
   `src/lib/quotes/activity.ts` (internal comments only) and `src/lib/accept/record.ts` (acceptance: Won,
   cancel, and the acceptance messages).
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
2d. **Customer links live on the customer deployment only.** There the proxy serves `/c/<token>`
   and 404s everything else, and `write()` refuses; on the staff app `/c/` is 404.
   `src/lib/quotes/customer.ts` answers only there and only for a well-formed token, returns the
   frozen copy and nothing live, and is imported only by `src/app/c/`. The only other thing `src/app/c/` may
   reach is `src/lib/activity/relay.ts`, which reports opens to the staff app and reads no Airtable, and, for
   acceptance, `src/lib/quotes/acceptClient.ts` and the pure rules it needs (accept plan, terms, settings,
   schedule). `tests/boundary.test.ts` pins all of this.
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

## Commands

```
cd quote
npm install
npm run dev          # http://localhost:3001 (needs .env.local, see README.md)
npm run lint && npm run typecheck && npm test
```
