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
- **Autosave and the Send guard (Albert, 2026-11-05: "grey out the send button if there is an outstanding
  unsaved version"; "yes build autosave").** A **Draft** saves itself 4 s after the last change, while online
  (`autosaveVersion()` in `src/lib/quotes/save.ts`: Save's own checks and refusals, then the version read back).
  The editor keeps its own ids on screen and learns the record each new line and option became (`SavePlan`'s
  `client`, `renameIds()` / `invertIds()` / `distinctIds()` in `model.ts`); everything saved, compared or kept on
  the device is in Airtable's ids. A sent version never autosaves (its save starts the next draft). A conflict
  holds autosave until someone acts; any other refusal, until the next edit. Offline, the device copy keeps the
  work and it retries every 30 s or when the connection is back. A save whose answer was lost is recognised as
  landed, not as a conflict (`alreadySaved()` in `savePlan.ts`). The Edit Log gets one line a sitting
  (`autosaveWritesLine()` in `history.ts`: none while the same person keeps autosaving within 15 min). A dropped
  connection on Save is said plainly instead of reaching the error page. While this device holds unsaved changes
  for a version, its Send quote and Send again are greyed out with a note (`unsavedDraftAt()`, `SendQuote.tsx`);
  changes on another device are not seen. Tested in `tests/save.test.ts`, `tests/history.test.ts` and
  `tests/editor.test.ts`.
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
  **+ New opportunity (Albert, 2026-11-03: "create the opportunity on the screen… same thing as in the
  preliminary")** is the card's last choice, for a quote that is a different job from every one listed
  (another unit at the same building). **Staff pick its pipeline and stage** (same day: "an option to pick
  where and what pipeline and what stage… it should not be [Won], because the only way for that to happen is
  if someone accepts a quote"): the project pipelines only, never STORE, every stage but Won (`placements()`
  in `src/lib/link/linkJob.ts`), starting on Lead Qualification at the quote's timing stage when it has one
  (`defaultPlacement()`), and checked again on the server against GHL's own list (`checkPlacement()`). A sent
  quote the customer said yes to outside the app is linked and then accepted for them (Acceptance), which is
  what moves it to Won. `createJobForQuote()` in `src/lib/quotes/link.ts` makes it (`buildNewJob()` in
  `src/lib/link/ghlRequest.ts`): the shared name, the quote number, the site only if confirmed, the quote's
  CompanyCam link; the contact is left alone. Make's `new-opportunity` route, as booking uses, so nothing
  changed in Make; the quote is marked Linked only once Make returns the new id. Tested in
  `tests/linkJob.test.ts` and `tests/ghlRequest.test.ts`.
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
  timeline, with the step numbers counted; v1 is *Preliminary* with one priced option per Job tab
  (2026-10-31, below), opened for review). The request says `kind: "measured"` for the first; anything else is a preliminary
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
- **The preliminary's option is named for what it installs (Albert, 2026-10-31).** It was called
  "Preliminary", which stayed on the tab, and on the customer's option heading, after the quote was
  measured. `optionName()` in `src/lib/quick/plan.ts` names it from the Install rows that made it onto
  the quote ("Install Hardwood (Nail Down)", "Install Tiles + Laminate / Vinyl / Eng Click"); a refinish
  keeps its own words; no install row falls back to the materials, then "Stairs", then "Flooring".
  The name never says Preliminary or Measured: that is the version's Basis. Quotes made before keep
  their name (rename the tab in the editor). Tested in `tests/quick.test.ts`.
- **Several options from the quick form (Albert, 2026-10-31).** "Create preliminary quotes for
  multiple options": the Job card has a tab per option (at most `MAX_QUICK_OPTIONS`, six), with
  **+ Another option**, **Duplicate** (a full copy to change a few fields) and **Remove**. Building and
  the project description are the quote's, the same on every tab. The request sends `works[]`
  (`parseWorks()`, empty tabs dropped; a single `work` still reads); v1 gets one option per tab, the
  first recommended, names kept apart by `distinctNames()` (the material, then the number). In the
  editor, **+ From quick form** beside **+ Add option** opens the same form in a panel (choices fetched
  on demand, `quickFormAction()`); **Add this option** prices it on the server (`quickOption()` in
  `src/lib/quotes/quickOption.ts`, which writes nothing) and adds it to the editor's unsaved changes
  (`addBuiltOption()`), saved like any other edit. Tested in `tests/quick.test.ts` and `tests/editor.test.ts`.
- **Quick form = the preliminary (Albert, 2026-10-15; phone layout 2026-10-18).** "Job", step 1
  of a preliminary, replaces the GHL "Preliminary Mobile Quote" form and its workflow: pick flooring
  work from short lists, type square footage, add staircases, see a live estimate. Laid out for a
  phone: Flooring, then Stairs, then anything else; each work group folds to a one-line summary;
  short lists are chips; "Same as install" copies the square footage onto Remove and Material rows;
  Baseboards rows in linear feet are **a third of the install square feet, rounded to the nearest
  foot** (Albert, 2026-10-22); Baseboards allows up to three rows (same day: baseboard in one area,
  shoe only in another). **A basis per row (Albert, 2026-11-04: "always calculate for the total sqft
  in the INSTALL tab as default and always be live… a manual override when the value is changed (with
  an option to reset to 1/3 of ___ sf). If there are multiple baseboards and shoemould rows… the option
  to select (1/3 of ___ sf) depending on how many different install options there are"):** each
  Baseboards row follows a basis live, the total of every Install row's square feet or one Install
  row's, kept on the form row only (the server still gets a number). The first row starts on the
  total; a row added after it starts on nothing, so nothing double-counts. Typing an amount is a
  manual override and stops it following. Chips under the row set the basis again: "⅓ of 820 sf",
  and with two or more Install rows "(all install)" on that one plus one per row, "⅓ of 500 sf
  (Hardwood)", the one followed shown picked. A basis naming an Install row that is gone, or the only
  one left, reads as the total; Duplicate points the copy at its own rows (`followBases()` /
  `basisChoices()` / `resolveBasis()` / `remapBases()` in `plan.ts`, replacing `baseboardFollow()`).
  **Material rows follow the install too (Albert, 2026-11-05: "Material selection should ALSO have the same option
  to select to match each selection on install if desired"):** the same basis, chips worded without the third
  ("2,600 sf (all install)", "500 sf (Herringbone (Vinyl))"), the first Material row on the total, typing an amount
  stops it following (`BASIS_GROUPS`, `basisAmount()`); "Same as install" stays on Remove rows only. **Material
  waste (same day: "auto apply a 10% increase in the sf. Herringbones and Tiles should be + 15%. And when translating
  into the quote edit, there is a field for it"):** the row's square feet stay the floor's, and the Materials line
  goes in with Waste 10%, or 15% when its choice or its product says herringbone or tile (`materialWaste()`), decided
  on the server, never sent by the browser; the row's rate says "+ 10% waste" and its total counts it, as the quote
  will (Qty × (1 + Waste), no change to `calc.ts`). Staff change it in the editor's waste % box. It applies to the
  Flooring Site Sheet's built options too, which are quick-form works; the form's
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
  `src/lib/quick/plan.ts`, tested in `tests/quick.test.ts`. A flat card row (a bin) goes in at its choice's
  Times, 1 unless set ("Large Disposal (Bin x 2)" is 2), and since 2026-11-04 a flat row picked in the editor
  starts at 1 too (`lineFromEntry()`; Albert: "it should already go as 1 as the quantity").
- **The waterfall: a choice, then its options (Albert, 2026-11-06: "the selection of the common items have the OPTIONS
  come up when chosen… Install T&G -> Full Gluedown -> Type of glue").** Quick Quote Choices → **Path** (text, parts split
  on " > ", `splitPath()`): choices in one group sharing a Path's first part are one entry on the form (`topChoices()`),
  and each later part is a row of chips under it (`waterfall()`); picking any chip moves the row to the first choice by
  Sort under it, so a row is always one real, priced choice. Blank Path = the choice is its own entry, as before. After
  the last part, a choice whose Rate Card row names a Material Group asks for it (**Type of glue** for a glue group,
  `materialQuestion()`), starting on the row's Default Material; the browser sends `materialId` and the server prices
  the line as the editor does: the row's labour + the glue, one line "work · glue", `materialId` on the line
  (`pickMaterial()`; a glue outside the part's group is ignored). Before this, a glue-down preliminary priced the labour
  only. The browser never gets a glue's cost. First family: **Solid Hardwood T&G** and **Engineered T&G** (same rates,
  Albert: "we can be more explicit"), each Nail down / Nail + glue assist / Full gluedown / Full gluedown + nail; the
  three hardwood rows were renamed that day and four Engineered rows and Solid Full gluedown + nail were added. The
  Flooring Site Sheet's engineered ¾" now builds on the Engineered T&G choices. Another family is a Path typed in
  Airtable, no code. **Drawn as secondary categories** (same day: "make the waterfall look like secondary categories"):
  the first pick keeps the big chips; each follow-up row is small outlined pills, indented one step per level on a thin
  accent rule (`.qw-fall`, `.qw-fall-1`…`-3` in `globals.css`), the picked one tinted. Tested in `tests/quick.test.ts`
  and `tests/floorsheet.test.ts`.
- **Stairs on the preliminary (Albert, 2026-10-18; presets 2026-10-20; Stair Item lines 2026-11-02).** A staircase
  is a row of the read-only Airtable table **Stair Profiles** (`PROFILE_TABLE`): a customer-facing name, a stair type
  (Main stairs / Townhome / Basement / Half staircase), a method (Sand & stain / Solid red oak caps / Vinyl treads /
  Vinyl flooring), the step count, links to Stair Items and the **preset counts** that multiply them: Per step (what
  every step gets: risers, sanding) × the steps; **each step type its own piece** (Albert, 2026-11-02: "most of the
  price changes are from the number of steps and the type of steps"): Per boxed step × Preset Boxed Steps (blank = the
  steps not open-side or curved), Per open side × Preset Open Side Steps, Per curved step × Preset Curved Steps (pie /
  winder); Per staircase × 1; Per landing × Preset Landings; Per handrail ft × Preset Handrail Ft; Per nosing ft × Preset Nosing Ft (one decimal);
  Per spindle × Preset Spindles; Per post × Preset Posts (blank = 0). No step type is ever taken out of a Per step item:
  "New Riser" is filed under category step, which is why the old rule (an open-side piece replacing the step piece in
  Per step) is gone; link the plain step piece to Per boxed step. The form is one dropdown per staircase, up to three, with no price of its own. **Since 2026-11-02
  (Albert: "once it processes through, it will add the preset items on the stair items for that particular selection";
  "remove different price, numbered labels are fine")** a pick adds the profile's Stair Item lines, `expandProfile()`
  with `defaultInput()` (steps + preset counts) at Standard, worked out once per form by `quickProfiles()` in
  `src/lib/quick/plan.ts` from today's card (`getQuickProfiles()` in `load.ts`; the browser gets them through
  `browserProfiles()`, no cost). The form shows what it adds and the total. A profile with no links, one linking an item
  the card no longer offers, or one that comes to no line is left off. **The changeover:** a row with no Stair Items
  linked at all keeps its stored Price as one preset line (`profileLine()`, no typed price, `storedPrice` on the form)
  until its links are set; with no stored price it is left off. Lines are labelled with the stair type, numbered
  when an option has two of one type ("Main stairs 1", `stairAreas()`). Being Stair Item lines, Premium marks them up like
  any labour from the card. **Different price is gone**; a price sent with a staircase is ignored. The stored Price and
  Cost on Stair Profiles are the old GHL figures, read for the changeover and for preset lines made before
  (`sourceKind: "profile"`, which still load, save and price as they were). The customer-facing phrases live in code, `src/lib/quick/stairs.ts` (copy,
  not data), and the old GHL stairs prompt is written out there as `stairDescription()` from each row's type and method:
  one bullet per staircase, the stair type's sentence, the closing sentence only when no staircase got one. Create
  writes it into the option's description. With no rows at all the editor's picker falls back to type × method at a
  typed price. Tested in `tests/quick.test.ts`, `tests/stairs.test.ts` and `tests/stairBuilder.test.ts`.
- **The stair builder (Albert, 2026-10-20).** In the editor's Stairs picker, picking a Stair Profile
  opens the builder: steps, boxed / open-side / curved steps, landings, handrail and nosing feet, spindles and posts, starting
  from the row's step count and preset counts (2026-11-02).
  `expandProfile()` in `src/lib/editor/stairBuilder.ts` multiplies the row's "Per …" links into
  Stair Item lines priced from the card at the option's service level (each step type counts its own piece, Per step
  counts every step (2026-11-02); a zero count makes no line; an
  item the card no longer offers is reported, never guessed; a row with no links says so). **Add
  staircase** adds the lines and, when ticked, replaces the preliminary's preset line for that
  profile (`addLines()` in `src/lib/editor/model.ts`), so the measured quote is an edit of the
  preliminary. Tested in `tests/stairBuilder.test.ts`. Next (not built): Material Group / Default
  Material on Stair Items for spindle, picket and post types, like the Rate Card's.
- **Stairs grouped by category, and always one price (Albert, 2026-10-28).** On the quote page and in the
  editor the Stairs section is split under small headings by the Stair Item's Category (Quote Lines →
  **Stair Category**, a lookup through Stair Item; the card's category for a line just picked), in work order
  step, bullnose, riser, landing, accent, railing, task, then anything else (`src/lib/editor/stairGroups.ts`).
  Display only: no money, section or Airtable write changes. **Send breakdown itemises the flooring only**:
  Stairs lines go to the customer with no unit price or amount and no section total, on every copy
  (`copyOption()` in `copy.ts`), and in the quote page's Customer view. **They always keep their quantity**
  (Albert, 2026-11-04: "Stairs never has line item PRICING but will always show the quantities of each line
  item"); lines that share a Customer Wording merge only when they share a unit too. The site sheet's nosing is one line in linear feet of "Accents: Nosing"
  ($30/ft on the card); picket-hole nosing is the same item.
- **One wording, one line for the customer (Albert, 2026-11-02: "I don't want to confuse the customer with the
  different types of steps involved… consolidate the steps to just be one generic step… and then just combine the
  quantity").** Stair Items → **Customer Wording** (text; blank = the item's name), read on Quote Lines through the
  lookup **Stair Customer Wording**. In the customer copy (`copyOption()` in `copy.ts`, so the link, PDF, email and
  What changed) Stairs lines that share a wording, the same area, the same included / add-on state and the same HST
  read as one line with that wording, quantities and amounts added (a unit price only when every piece had the same).
  Staff screens keep every piece. Tested in `tests/send.test.ts`.
- **Each Stair Item has its own unit (Albert, 2026-11-04: "an option column for the units name for each stair item…
  And the rest of the app uses those too").** Stair Items → **Unit** (single select): **steps** (every step, riser,
  bullnose, pie and tread item), **sets** (corner turn sets), **ft** (nosings, handrails, trims), **pcs** (spindles,
  pickets, and, as set that day, posts and the wall rail bracket); blank = the number only (stringers, landings, the
  complex handrail). Every stair line takes its item's unit where it is made (`lineFromEntry()`, so the editor, the
  builder, the preliminary's staircases, the quick form and the site sheet build; the site sheet's nosing no longer
  forces "linear ft"), replacing the hard-coded "piece". A line saved before with "piece" reads its item's unit through
  the lookup Quote Lines → **Stair Unit** (`stairLineUom()` in `src/lib/editor/stairGroups.ts`); a unit chosen on a
  line since stays. Quote Lines → UOM gets steps / sets / ft / pcs by typecast on the first save that uses each
  (`LINE_UOMS`); a typed stair line saved for review carries its unit to the new Stair Items row. Frozen copies keep
  what they were sent with. Tested in `tests/stairGroups.test.ts`, `tests/editor.test.ts` and `tests/quick.test.ts`.
- **A Stair Item's cost is Labor Cost + Material Cost (Albert, 2026-10-31)**, as Airtable's own Profit / Margin %
  on Stair Items has it; `stairCost()` in `src/lib/pricing/stairCost.ts`, read in `getRateCard()`. A line keeps the cost
  it was added with (Unit Cost Snap), so lines made before keep labour only until rebuilt or retyped.
- **Stairs is its own section again (Albert, 2026-10-18)**, after Install, everywhere sections
  show (quote page, editor, customer page, PDF, Analysis), with its own subtotal; Stair Items are
  offered in that section only. This reverses the 2026-10-12 fold into Install; Refinish, Paint
  and Sand still fold. Grouping only: no money formula and no Airtable change.
- **The GHL mobile-quote workflow is retired (Albert, 2026-10-18).** Its form, custom fields
  (`remove_1_sqft`, `staircase_profile_1`, `score_5n31`…) and tags stay in GHL as a manual backup
  for when this app is down; the app never writes them. Since 2026-10-27 sending adds one thing to GHL
  beyond the message: the follow-up tag (below); no note, stage or field. **Since 2026-11-05 (Albert: "put a
  note when sending the quote out of the link to the quote… the one that does not count towards the open
  count for staff to click"; settled the same day after a try as a contact note: "As an internal comment right after
  the sms/email to the client: Staff Link to Quote: … Edit the Quote: (link to the quote app)") it also posts one
  internal comment** on the customer's conversation, right after the email or text goes and before anything else,
  **and the same words as a note on the contact** (same day: "You can do the same in the customer notes. To match.
  Have the quote and version too"; `addContactNote()` in `src/lib/make/client.ts`, Make 4975508's `note` route, a
  filtered POST to `/contacts/<id>/notes`, `{"body":"..."}` only): the quote and version (`Q-1234 v2`), then
  `Staff Link to Quote:` the customer link with `#staff` (`staffViewLink()`, never counted) and `Edit the
  Quote:` the version's page in the app when `staffQuoteLink()` knows it (`sentComment()` in
  `src/lib/activity/track.ts`, tested in `tests/activity.test.ts`; its place in the send pinned by
  `tests/boundary.test.ts`). It tags nobody and a failure never stops a send. Send again posts none. Versions sent before
  2026-11-05 got the contact note by hand (their comment came from the first run) (`noteSentLinks()` in `src/lib/quotes/activity.ts`, `{step: "sent-notes"}` on
  `/api/activity`, run from the manual `.github/workflows/quote-sent-notes.yml` with the exact version ids): only a
  version still Sent, never a replaced one, and nothing is written to Airtable, so a second run adds them again. Counts of preliminaries come
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
  follow-up is the automation's. **Since 2026-11-05 no comment tags anyone** (Albert: "make the comments not tag the user on open. No need
  on any of them. Just informative"): both go with `mentions: []` and no @names, as the send note does, and
  the lookups that chose who to tag (`mentionsFor()`, `contactOwner()`, `opportunityOwner()`,
  `FALLBACK_MENTION_USER_ID`) are gone. `tests/boundary.test.ts` pins the empty mentions. Only versions sent since tracking began (Track Activity) get comments.
  The Send card shows the activity once sent, and All quotes has a **Last opened** column (the current version's last open and how many in all) and marks opened versions in each quote's version list (`openedOn()` in `src/lib/quotes/group.ts`); staff opening a
  link from the Send card add `#staff`, which is never counted. Rules in `src/lib/activity/track.ts`,
  tested in `tests/activity.test.ts`.
  **Counts always show, and a draft never blanks Last opened (Albert, 2026-10-31).** Each version in the list
  reads "Opened · 1 open, last today 2:14 pm" (`opensWords()`), its own count, a new version starting at none.
  The Last opened column reports the newest version that went out (`lastSentVersion()` in `group.ts`: Sent,
  Superseded, Accepted or Won), so a newer draft or draft change leaves the customer's last open showing,
  labelled with its version (e.g. v2) when it isn't the current one. Tested in `tests/group.test.ts`.
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
  it is offered. This replaces the 2026-10-24 **Attach PDF** tick, which had left the button on every page. **Send again (Albert, 2026-10-30)** on a version still Sent and in date sends the same link again by email and/or text (`resendQuote()` in `src/lib/quotes/send.ts`; messages and checks `resendEmailMessage()` / `resendSmsMessage()` / `resendProblems()` in `plan.ts`), for a customer who asks for the PDF later: **Include the PDF** turns `pdf` on in the frozen copy (the one field it changes) and puts the PDF's link in the message, still never an attachment. No status, date, follow-up tag or supersede changes; one Edit Log line. An Accepted or Won version can be sent again too (same day): the PDF is its signed accepted PDF (`acceptedPdfName()`) and its copy is never written. **The resend message is short (Albert, 2026-10-31: "simpler, less bloated"):** one line, "Here's your quote again" / "accepted quote" (Accepted or Won) / "updated quote" (a sent change), the button(s) and the sign-off (`resendKind()` in `plan.ts`); Send again shows on the card straight after a send, no reload. **A preliminary's header is a solid blue PRELIMINARY ESTIMATE tag everywhere it is shown** (email `prelimTag()`, customer page `.cq-prelim-tag`, PDF; Albert, 2026-10-31). **A replaced link** opens with a bold "This is an older version of your quote" box and a See the newer quote button (same day). **A preliminary has no
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
  wordmark), a serif headline, the price (since 2026-10-31, Albert: "in the email I just want them to actually go into the link"):
  one option is one card with its total set large and the price with HST, two or more are one list of names and prices
  (`optionList()`, a range under its name), and no line, quantity or timing rows; the line under it sends them to the
  page for what's included, the materials and the payment schedule; a pill button, the payment schedule in words on a measured quote, three
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
  check live, the send runs everything). The previews and PDF follow the ticks (`?options=`). **Several options are worded "There are N options for you to take a look at, from as low as" the
  lowest price before HST** (Albert, 2026-10-31), in the email's intro and preheader and the text (a
  preliminary: the lowest range's low end), via `severalWords()`; flooring-and-stairs quotes keep each
  scope's own price. **The
  email lists two or more options compactly** (names and prices before HST; the detail is on the
  page; three or more since 2026-10-24, two since 2026-10-31). Tested in `tests/send.test.ts`.
- **Options side by side on the customer's page (Albert, 2026-10-31; vault `05_decisions/2026-10-31-quote-options-side-by-side`: "it should stay in the same section and just
  show the different details instead of scrolling down … optimized for readability, especially for an older
  generation").** With two or more options, `/c/<token>` and the staff Preview show a compact row of option
  buttons (number, name, price, Recommended) and the chosen option's full details right under it; tapping another
  swaps them in place (`src/components/OptionSwitcher.tsx`, a client component that only shows or hides panels
  `CustomerQuote` drew on the server; no figure of its own). It starts on the recommended option, else the first;
  flooring and stairs get one row each. Printing shows every option. **Switching never moves the page** (same day,
  Albert: "it doesn't scroll down into an odd place"): the option buttons are held where they were on screen and the
  details slide in from the side picked. **Each option is three cards** (same day: "more separation between the
  actual details and the summaries"): the option, What's included, Price and payment, headings in sentence case.
  **Each group is one framed section** (same day: "more like a header and more obvious… more of a border"): a tinted
  box with a firm border and a header band ("Flooring options", "Stairs options", or "Your options"), holding its
  option buttons and the chosen option's details, with a clear gap between groups. Readability inside `.cq`: 16px body, 15px
  lines, nothing under 13px, darker greys than the staff app, 44px tap targets. The PDF and email are unchanged.
- **A preliminary goes as a range (Albert, 2026-10-27).** Customers took a preliminary's one number as
  the price, so a measured quote that came in higher read as a change. Everything the customer gets
  (email, text, page, PDF) shows the price before HST as a range instead: **3% under to 10% over, the top
  never more than $3,000 over** (same day, Albert: a measured quote rarely comes in lower, people read a
  range from its low end, and 10% of a big job is too wide), each end rounded outward to a round figure
  ($10 steps under $1,000, $50 under $10,000, $100 above; `priceRange()` in `src/lib/send/copy.ts`), the
  range with HST under it (the same range with the HST on it), no HST amount, the discount as its rate and
  reason only ("Included in the range", 2026-11-03; there were no discount rows before), and the
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
  **Only ever from the person sending (Albert, 2026-11-04: "whoever is logged into the quote app and sends
  it only. This should stay true for everyone").** The location-default fallback is gone from sending, Send
  again and invoice/receipt emails: `fromAttempts()` tries the named and the bare address and nothing else,
  so a sign-in GHL can't send from means the email does not go (the text still can) and the Send card says
  so (`noSenderWords()`). The acceptance confirmation, which no person presses, still falls back.
  **Since 2026-11-05 it does not (Albert: "number and email sent is the same person").** The won email goes from the
  version's Sent By only, named then bare (`acceptedFromAttempts()` in `plan.ts`), signed by them, and the won text goes
  from their GHL number (`textFromFor()`), so a signature never arrives from someone else's address. Refused by GHL,
  the email doesn't go and the hand-off says so for Retry. Only a version with no Sent By falls back to GHL's default
  sender, signed by the company.
  **The front desk is Joey** (same day): `SHARED_MAILBOX_NAMES` in `history.ts` signs info@titanfloors.ca
  as "Joey" whatever its sign-in name says.
  **Texts from their own number too (Albert, 2026-11-04: "Pourya = pourya's ghl number and email (which matches the
  signed in); Joey = front desk's ghl number and email; Albert = albert's ghl number and email").** A send and a Send
  again text carry `fromNumber`: the number GHL has assigned to the signed-in person's own GHL user (its `lcPhone` for
  this location, never their personal phone), found by sign-in email (`locationUsers()` in `ghl/client.ts`,
  `textFromFor()` / `e164()` / `fromTheirNumber()` in `plan.ts`, `textFrom()` in `send.ts`). A GHL user with no number
  of its own, or no GHL user with that email, texts from GHL's main number as before. The Send card says which
  (`textsFrom()`); the Edit Log says "text from …". The acceptance text, which no person presses, stays on the main
  number (until 2026-11-05: now the sender's, above). Make forwards the body verbatim, so nothing changed in Make. Tested in `tests/send.test.ts`.
  **Albert may send as someone else (Albert, same day: "give ALBERT an option to select who I want it sent out from?
  Only Albert has the option to").** For the one sign-in in `SEND_AS_PICKERS` (`src/lib/send/sendAs.ts`), the Send card
  and Send again show **Send as**: everyone on `QUOTE_ALLOWED_EMAILS` on the company's email domain, named from their
  GHL user, himself first (`sendAsChoices()`). Picking someone sends as them in everything the customer sees: their
  address (`emailFromFor()`), their GHL number (`textFromFor()`), their first name signing it, and Sent By is them (so
  open-tracking tags them). The Edit Log keeps Albert as the one who pressed it, adding "as <email>". The email
  preview follows the pick (`?as=`). The server decides again (`resolveSender()` in `sendAs.ts`, `senderFor()` in
  `send.ts`): a pick from any other sign-in, or of an address not on the list, is refused, never sent as them. Tested
  in `tests/sendAs.test.ts`.
  **Everyone may pick (Albert, 2026-11-05: "open up the 'choose' sender option for people that isn't Albert. BUT Albert
  is not an option. Only Albert logged in has himself as the option"; "lets make the picker always default to the
  person logged in").** `SEND_AS_PICKERS` is gone: every sign-in gets Send as, starting on themselves, and Albert
  (`ONLY_THEMSELVES`) is a choice only for Albert; `resolveSender()` refuses anyone else's pick of him. The card says who
  sent the quote last ("Last sent by Joey · v1 · Nov 5", `lastSentOf()` over the quote's versions, `sendAsForCard()`),
  shown only, never picked for you. **Invoice and receipt emails have it too** (Albert, same day: "put the picker there
  too"): `emailBilling()` takes `as`, checked by `pickSender()` in `send.ts`, and the Edit Log adds "as <email>".
  **A GHL user with no number of its own is not texted from the main line (checked in GHL, 2026-11-05).** The app then
  sends no `fromNumber`, and GHL picks one itself: the front desk's quote and won texts that day went from the number
  the contact had last been texted from (the assigned salesperson's), and so did a text typed in GHL by the front desk.
  The email is unaffected. **So a text goes only from the sender's own number (Albert, same day: "email and text should
  be aligned"):** with no number of their own the text doesn't go, exactly as an email doesn't from an address GHL can't
  use (`noNumberWords()` in `plan.ts`): Send quote, Send again and the won text alike, and the Send card greys the Text
  tick and says why. The cure is a number on that GHL user (Settings → My Staff → the user → LC Phone). Only a won text
  for a version with no Sent By, signed by the company, still goes without one.
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
  **Contractor (Albert, 2026-11-04: "an automatic 10% decrease on the overall price… on the left side of
  the Standard/Premium")** is the slider's first stop: lines priced as Standard, and one discount item,
  "Contractor pricing (10% off)", 10% of the list price, kept in step after every editor change
  (`settleContractor()`, run by the editor's `apply`) and removed on any other level. Service Level gets
  the "Contractor" choice by typecast on the first save.
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
- **Charge HST is per option (Albert, 2026-11-04: "for the HST application at the bottom; I'd like for it to ONLY
  apply for the option it is on. Not to all options").** Quote Options → **Charge HST** (single select: Charged / Off;
  blank = the version's Show HST, which every option followed before, so nothing made earlier moves). The editor's
  terms box is now **Charge HST (13%) on this option** (`setOptionHst()` in `model.ts`); the version's switch is no
  longer shown and stays only as the default for options never set. Every total, schedule and check takes
  `optionHst(quote, option)` from `calc.ts`. Airtable mirrors it: Quote Options → HST reads Charge HST, then the
  version's Show HST. The customer copy freezes it per option (`CopyTotals.hstCharged`, read through `hstOf()` in
  `copy.ts`; a copy frozen before has none and reads `CustomerCopy.showHst`, now true only when every option charges
  HST), so the link, PDF, email, acceptance add-ons and invoices follow each option. An invoice needs every option on
  the contract to charge HST (`billingKind()`). A contract joining options that differ charges the whole HST only when
  every part does, and re-says each differing part's line HST words against the whole (`rebaseHst()` in
  `contract/model.ts`). Make a change keeps each option's HST from the version it came from. Tested in
  `tests/send.test.ts`, `tests/editor.test.ts` and `tests/scope.test.ts`. **All at once (Albert, same day: "a button
  that can turn all options on or off… with a confirmation modal"):** with two or more options, **Set HST for all
  options…** beside the switch opens a modal (`src/components/editor/HstAll.tsx`) listing each option's HST now and its
  total with HST on and off; **Charge HST on all** / **No HST on any** sets every option and the version's Show HST
  (`setAllHst()`), so an option added after starts the same way; Cancel changes nothing.
- **Swappable material (Albert, 2026-10-16; corrected 2026-10-28).** A Rate Card row can name a
  Material Group and a Default Material (table Install Materials: Name, Group, Cost, Price per unit
  of the job, Active; read only). On the line the material can be swapped for any priced material in
  the group: one line for the customer, named "work · material". **The row's Titan Rate and Total Cost
  are labour only** (2026-10-28, Albert: the picked glue "does not update the unit cost and unit price,
  so it's still showing just the labor"; the 2026-10-16 reading that the row already included the
  default had been subtracting it back out). The line = the row (at the service level, so Premium
  marks up labour only) + the chosen material. A row whose default has no price offers no material.
  Contractor and crew changes keep the material. **The material's own unit cost and price are editable**
  (same day, Albert) in small boxes under the line's: a typed figure is stored as the line's Unit Price /
  Cost Override (labour from the card + the typed material), so Airtable and `calc.ts` are unchanged;
  `materialSplit()` / `setMaterialFigures()`.
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
  lose unit price and amount; **every line keeps its quantity** (Albert, 2026-11-04: "For all the PDFs quotes
  and links in the app; no matter what view is sent to the customer. The quantities are always shown"),
  replacing the Install / Removal / Prep / Materials-only rule (`LUMP_QTY_SECTIONS`, removed); the Private
  roll-up row is the one row with no quantity; **a material always keeps its rate** (Albert,
  2026-11-04: "Material Rates in the material section should ALWAYS show the rate; no matter what the form
  the quote is sending in"): lump sum and preliminary too, never its amount, headed Rate in the PDF; sections lose their total; the totals
  block shows the price before the discount and the discount (2026-11-03; before that there were no discount
  rows), then price before HST, HST and total with the payment schedule; optional add-ons keep their price, since they are not in it; the
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
  **It stands apart on staff screens** (Albert, 2026-11-04: "a very small separation so that it is very
  obvious"; then "more greyed out… just a purple LINE… less pop out is okay"): a wider gap above, one thin
  violet line, its header and lines greyed, and a grey PRIVATE tag (`tr.sect.priv`,
  `.priv-tag` in `globals.css`), in the editor and on the quote page.
- **Accepted price (Albert, 2026-10-22; above the list blocked 2026-11-04, see The price card).** Under each option's overview in the editor, **Accepted
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
- **The price card (Albert, 2026-11-04).** Under each option's totals in the editor, `PriceCard.tsx`
  replaces the accepted price row. **Discount % is gone from the terms** ("so no manual full percentage
  adjustments are available"); a discount is made in the card only.
  - **Discount items, left** ("persistent until removed"): each a Quote Line in the new **Discounts**
    section (`DISCOUNTS_SECTION`), one, flat, priced below zero, so `calc.ts` and Airtable's formulas count
    it with no change. **Dollars only** (Albert, same day: "please only allow for dollar discounts in the
    discounts tab"; a percent is refused, `discountAmountFrom()`). The customer sees each by name as a discount row above the price (`CopyOption.discounts`,
    `discountRows()`; a range names them, "Included in the range"), never as a line; the quote page and
    editor totals list them too. Airtable gets the Section choice by typecast on the first save.
  - **Accepted price, right: three linked boxes**, price before HST, total discount % and margin %
    ("whichever one you edit will update the other 2"). The total discount counts everything off the list
    price, discount items included (`priceSummary()` in `src/lib/pricing/discounts.ts`). Each lands the
    price through `setAcceptedPrice()`, which moves only this option's accepted price discount (below) and
    leaves the discount items where they are. **Never above the price the slider and discounts make (`priceCeiling()`;
    Albert, same day: "lets block it. This means any pricing increases should be added in as private line
    items; or increased rates. The goal is to have less change for mistakes")**: a higher price in any box
    changes nothing and the card says to add a Private line or raise a rate; the 2026-10-22 above-list
    "Accepted price adjustment" line is no longer made (one on an older quote comes off with the next price
    typed, or Reset); the rate now lands to the cent
    (`landingRate()`, eight places). **Master:** while it is set, a change to the service level or the
    discount items keeps the price and moves the rate (`keepAccepted()`). **Reset, or clearing any of the
    three boxes, clears all three** (same day: "deleting one section clears all the other ones… Pressing
    reset should clear all 3 out"): rate 0 and the adjustment line off (`resetAccepted()`), so the price
    reads the slider and the discounts again. The Discount reason moved into the card.
  - **Per option, in dollars (Albert, 2026-11-04: "For accepted price; it should only apply to the selected option
    and not carry over to the other items. Same as the discount section. Only on the selected option"; "discounts are
    dollar line values only. not % by the way").** Below the list price the accepted price is now this option's own
    line in its Discounts section, **"Accepted price discount"** (`ACCEPTED_LINE`, `isAcceptedLine()`), one, flat,
    updated in place, its reason in the line's Client Note (`acceptedReason()` / `setAcceptedReason()`); the customer
    reads it as "Discount · reason" (`acceptedLabel()`), in dollars. Never above the price as it stands
    (`priceCeiling()`, above). Reset clears this option only. **No version Discount Rate is set any more**: a version that has one (saved
    before) keeps it until an accepted price is next set or reset, when `detachVersionDiscount()` hands each option
    its dollars as its own line, with the version's reason, and clears the rate and reason, so no other price moves.
    Discount items take dollars only (`discountAmountFrom()` refuses a percent); the Total discount % box stays, as a way
    to type a price. calc.ts and Airtable's formulas are unchanged (the line is a line). One difference from a rate:
    with HST off and HST on materials only, a dollar discount line does not lower the materials' HST, as discount items
    never did. Tested in `tests/editor.test.ts`, `tests/discounts.test.ts` and `tests/send.test.ts`.
  - **Held, firmly (Albert, 2026-11-04: "Keep this a firm rule. When the accepted price is edited. no other pricing
    adjustments like discounts can move that accepted price number. Meaning the margins and discount % can change there.
    But the value doesnt change").** Every editor change goes through `holdAccepted()` (the editor's `apply`, after
    `settleContractor()`): an option whose accepted price is set, and was not itself just set, reset or cleared
    (`acceptedSig()`), keeps its price before HST to the cent, its accepted price discount taking up whatever moved
    (discount items, the slider, the Contractor level, lines), so only the margin and total discount % change. A change
    that could only be held with a markup is **refused**, never reset: nothing changes and the editor says so, above the
    lines and above the card, until Reset. A price typed at the price as it stands pins it (a $0 accepted line). The card
    shows **Held** and says what moves instead. This replaces "a slider change that would need a markup resets it".
    Tested in `tests/discounts.test.ts`.
  - **Margin and profit** under the boxes (list price, items, adjustment, price, cost, profit, margin),
    and an **(i)** with the lowest price that keeps the **20% margin minimum** (`MIN_MARGIN_PCT`,
    `priceForMargin()`, rounded up to the cent); under it the card says so and offers to set it. Customer
    view leaves the margin box, the readout and the (i) out. Tested in `tests/discounts.test.ts`.
- **The customer always sees the discount (Albert, 2026-11-03: "All quote links and PDF should show the
  client what the discounts are").** Every customer page (`/c/<token>`, the staff Preview) and every PDF
  shows the discount rows above the price when the version has a discount: itemised as before ("Subtotal
  before discount", then "Discount (10%) · reason" in dollars), a lump sum the same way ("Price before
  discount"), and a preliminary's range as the rate and reason with "Included in the range", never a
  dollar amount, since that would give away the exact price the range hides. It is drawn from the
  frozen copy's totals, which always carried the discount, so links already sent show it too. One rule
  for the page and the PDF: `discountRows()` in `copy.ts`; a long reason wraps in the PDF. The email and
  the text are unchanged: they lead with the price only. Tested in `tests/send.test.ts`.
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
- **Site sheet (Albert, 2026-10-28).** A **Site sheet** tab on the quote page, beside Rooms, staff only. The PM
  fills the two-page paper **Stair Site Sheet** (v6 since 2026-10-31; v5 sheets still read) on site: what is there (staircases, shape, what is on the
  steps, a tread grid of RSO / LSO / Boxed / 2 side open by 36 / 42 / 48", pie and bullnose by open
  side (LSO / RSO / 2 side open, never boxed), every count box in B1–B8 adding up a count written in parts ("4+3", `sumParts()`, Albert 2026-10-31: "count and write, not mentally add"; Claude adds parts written in one box on the paper), pizza sets as 2-pc and 3-pc counts plus how many of those are 2 side open (2026-10-31; custom = every 2-pc set and any 2 side open, shown on the row; the 2-side-open sets are taken as the 3-piece ones first, so custom pieces are never undercounted; an older stored sheet's single sets count is carried over in `cleanSheet()`),
  landings by size, half moons, stringers (White / Stained; a blank Made of reads as veneer), nosings as a
  staircase default (carpet on now, thickness, depth 4.5" unless written) plus one column per piece (length, a
  depth or thickness only if different, Sand ticked only if kept), railing as one column per run (length, steps / flat /
  wall, curved, pickets ticked or their feet), a metal-bar tick, and optional spindle counts and picket heights, and posts) and box G, what the customer wants. Staff photograph both pages into the
  tab (`/api/sitesheet`, signed in; each photo made a JPEG of at most 2000 px in the browser as it is picked, `preparePhoto()` in `src/lib/sitesheet/photo.ts`: iPhone HEIC through `heic-to`, loaded only for a HEIC, since desktop Chrome can't draw one and the API takes JPEG / PNG / WebP only, 2026-10-31); **Claude reads them** (`src/lib/anthropic/client.ts`,
  model `claude-opus-5-5`, one JSON object in the answer's text, the schema written into the message in `src/lib/sitesheet/prompt.ts` (the model refuses a forced tool call and the structured-output setting refused the sheet's 70 nullable fields), read by `jsonFromText()` and then `cleanSheet()`; server-side fallback on a refusal), the
  photos go on **Quotes → Site Sheet Photos** and what was read on **Quotes → Site Sheet** (JSON, app-written,
  compare-and-swap like Rooms; `src/lib/quotes/sitesheet.ts`). A person checks every field beside the photos
  (uncertain ones are marked) and presses **Save check**. What was read is drawn as the paper sheet (v6) itself, one box for one box
  (Albert, 2026-10-29), each page beside its photo: `src/components/SiteSheetPaper.tsx`, styles scoped under `.ssp`; every bubble, tick
  and box on it is the control for that field, and a code Claude marked unclear is washed yellow. Change the sheet and this copy together. The app works out, never asks: risers = treads + one
  per landing (a half moon counts) + one for the top floor; open sides from the grid; spindles from the railing runs (2 a foot of
  rail with pickets on the steps, 3 a foot on the flat, Albert 2026-10-31, replacing 3 a foot on both from 2026-10-28; with no runs written, 2 a step and 3 a 2-side-open step),
  holed nosings one per flat run with pickets, rail feet split straight / curved (curved priced from "Task: New
  Curved Handrail + Stain"), the on-steps runs added up and flagged when far from ~1.1 ft a tread (or twice that, both sides open), where a written count higher
  wins and a lower one is flagged; picket heights 36 / 39 alternating on the steps, 36 on the flat top; oak at
  about 20 sq ft a box; wall-rail brackets, the first 1 ft in then one every 2 ft; custom pieces (a 2-piece pizza
  set, a 3-piece one that is 2 side open, every 2-side-open bullnose) (`src/lib/sitesheet/derive.ts`). **Build stair options** puts one option per G1
  tick (Not sure or nothing ticked = all four) into the editor's draft for the quote. **The checks never stop it (Albert,
  2026-10-31: "just FYI: this is what we think, but never a restrictor for creating the stair option")**: no Save check
  needed (edits are saved first without marking the sheet checked, and a failed save doesn't stop the build), and an
  option the rules below advise against is still built with a "Not advised" note and never recommended (`buildOptions()` in `src/lib/sitesheet/options.ts`, Stair Items
  found in `ITEM_NAMES` by record id first, then today's name, then old names (2026-10-31: renames in Airtable had unpriced most lines)): sanding only over wood caps (never under carpet; painted wood red-flagged;
  the piano look, white risers and stringers), new caps always with new risers and recommended on a curved or
  spiral stair, vinyl treads and vinyl steps as separate options (no vinyl treads on a curve), square off bullnose a line per
  bullnose, custom pieces in place of the standard one, never on top (Albert, 2026-10-31: a custom corner set or a solid half moon replaces the standard piece; a 2-side-open bullnose is the custom bullnose, and "Bullnose Custom Size" was deleted from Stair Items), a 3 × 6 landing its own item "Landing (3x6)" (two 3 × 3s; another size priced as a 3 × 3 with a note), stringers one per staircase both sides (D3 takes a decimal like 1.5), steps one line per width at the one price, no carpet-removal line ever (it is not charged), stringers white → paint / stain on solid → sand & stain /
  stain on veneer or unknown → oak skin, new spindles and posts replace all plus the ones to add, a pizza set one price
  per turn, the half moon the card's all-in flat rate. An answer with no Stair Item becomes a Stairs line with
  no price and a note, never a guess. Ten such items were added to Stair Items on 2026-10-28 with blank prices for Albert to fill (carpet off the stairs, vinyl treads, vinyl flooring on steps, paint risers white, solid half-moon upgrade, pie step left, custom bullnose upcharge, wall rail bracket, refinish post, stain wood spindles), and two more with sheet v5 (square off bullnose, custom corner turn set upcharge); a blank-priced item is skipped by `getRateCard()`, so each stays an unpriced line until it is priced. Staff review and **Save as new version** in the editor as usual; the
  tab writes no quote line. Tested in `tests/sitesheet.test.ts`. Requote threshold (±5% or $300) is a starting
  point to check against real jobs, not built.
- **Site sheets from CompanyCam, and the Flooring Site Sheet (Albert, 2026-11-03: "build the sheets from companycam into rooms
  and flooring lines. No car check yet. Just the upload of the sheets from companycam. We can choose which one it is").** On a
  quote whose CompanyCam link gives a project, each sheet has a **Draw from CompanyCam image** button (`src/components/CamDraw.tsx`;
  the flooring sheet at the top of the tab). **Both sheets take photos the same three ways (Albert, 2026-11-03: "an option to
  still take a photo, choose photos, or draw from [a CompanyCam] image… Those should be the same"):** Take a photo, Choose photos
  and Draw from CompanyCam image, in one shared row, `src/components/SheetSource.tsx`; an upload says which sheet it is
  (`kind` in the form, `readSiteSheet(…, kind)`), and a flooring sheet read from an upload keeps no CompanyCam source. It opens the job's photos in place
  (`camSheetPhotosAction` → `sheetCamPhotos()` in `src/lib/quotes/sitesheet.ts`, the quote's link read from Airtable, never the
  browser), tagged or described "Site Sheet" ticked first (`looksLikeSheet()`); staff pick the page(s) and it is read as the
  sheet the link sits on. `/api/sitesheet` takes a JSON body `{quoteRecordId, seen, photoIds,
  kind}`; `readFromCompanyCam()` checks each id is a photo on that project (`sheetImages()` in `src/lib/quotes/companycam.ts`) and
  downloads the **plain** copy (no markup, `CamPhoto.plain`): the original, shrunk to 2000 px when it is larger (below). No image
  passes through the browser. A stair read then goes exactly as an upload does. Uploading from the device stays. **What a page
  is checked against, Draw again, Start over (Albert, same day: "a preview of the uploaded photo that it's comparing against";
  "if it's already been drawn, then there should be an option to do it again").** A read keeps, on both sheets' JSON, the
  CompanyCam photos it came from (`cam`) and the names of the copies it attached (`files`, `attachName()`, unique to the
  second); `previewsFor()` in `src/lib/sitesheet/source.ts` (tested in `tests/sitesheet.test.ts`) gives each page this read's
  copy, else the CompanyCam photo (asked of CompanyCam once by `useSheetPreviews()`, never stored), else nothing, and a page
  with nothing takes no column. The stair sheet shows it beside each page; the flooring sheet at the top. A sheet read
  before keeps showing the quote's photos as it did. A failed attach is logged with Airtable's answer. The picker reads
  CompanyCam again every time it opens (it once opened empty on a held answer) and ticks the last draw's photos again.
  **Start over** clears the sheet's field (`clearSheet()`, compare-and-swap, after a confirm); the photos stay. The flooring
  sheet reads left to right like the stair sheet, on its classes (Albert, same day: "the left side is the image itself, the
  middle is the information drawn, and then the right side is the next steps"): photo | paper in `.ss-pair`, then What it
  builds with Build, Save check and Copy rooms in `.ss-result` (first on a narrow screen). **Resolution (same day:
  "how come the resolution on the company cam image is so low?"):** CompanyCam's "web" copy is 400 px. A sheet is read
  from the plain original, turned upright and shrunk to 2000 px JPEG on the server (`fitForReading()` in
  `src/lib/quotes/companycam.ts`, `sharp`); the 400 px copy is a last resort and the result says so (`small`). The preview
  uses the original too. **The Flooring Site
  Sheet** (`quote/sheets/flooring-site-sheet-v1.pdf`; vault `05_decisions/2026-11-03-measured-quote-from-site-sheets`) is read by
  Claude with `src/lib/floorsheet/prompt.ts` into `cleanFloorSheet()` (`src/lib/floorsheet/sheet.ts`), kept on **Quotes → Flooring
  Sheet** (JSON, app-written, compare-and-swap, with the CompanyCam photo ids) and its photos on **Quotes → Flooring Sheet Photos**
  (both made 2026-11-03), with each photo's CompanyCam page and time taken. **It is drawn as the paper sheet itself (Albert,
  2026-11-03: "the sheet should look 1:1 to the copy online. Easier to compare")**: `src/components/FloorSheetPaper.tsx`, the
  printed v1 box for box on the stair copy's `.ssp` styles plus `.fsp`, every bubble, tick and box the control for its field,
  unsure codes washed yellow; change the printed sheet and this copy together. The photo took no column at first (same call: "it could just
  be at the top of the page"): the panel's top line says when it was taken and links **Open image** (a new tab) and **Open in
  CompanyCam**, and **Draw again**. Beside the paper since 2026-11-03, above it on a phone (`src/components/FloorSheetPanel.tsx`): the photo, what it builds, **Save
  check**; **Copy rooms to the Rooms tab** (replaces the Rooms tab through `saveRooms()`, `roomsFromSheet()`); **Build flooring
  options** prices it on the server like a preliminary (`floorOptions()` in `src/lib/quotes/quickOption.ts`: `floorPlan()` makes
  quick-form works, `buildQuickOptions()` prices them, writes nothing) and adds them to the editor's draft as Flooring options. The
  rules, in `floorPlan()` (`src/lib/floorsheet/plan.ts`, tested in `tests/floorsheet.test.ts`): two floors at most, set room by
  room; a room's New floor left blank gets every floor written; a room with both floors makes two options (Floor 1 there, or
  Floor 2), else one option holds both floors; W1 names the material and its install (engineered ¾" and solid take Nail down /
  Nail + glue, blank = nail down, said); W2 blank or Standard = the choice's standard product, Customer supplies = no material line,
  a SKU = that catalogue product by exact SKU (`productsBySku()`), and a SKU not found leaves the line for staff, never the
  standard one; Remove by Floor there now (carpet and laminate / vinyl share "Carpet / Laminate / Vinyl"; tile on plywood and on
  concrete apart); Remove or Disposal blank = the customer does it, no line; baseboards from every room's linear feet, else a third
  of the square feet (said); subfloor over the sq ft written, else every room. Quick Quote Choices are found by record id, then
  name; one switched off has no line and is named. Each option's description lists its floors and rooms. No car check, no send:
  staff review in the editor as usual.
- **The payment schedule (Albert, 2026-10-27: "update the payment structure to be editable").** One
  per version, in the editor's terms: presets **35 / 35 / 30** (the default, stored as nothing, so an
  untouched version's Quote Versions → Payment Schedule stays blank), **25 / 25 / 25 / 25**, **50 / 50**,
  and the **material deposit**; then any stage's name, share, "when" and how it is paid (by e-transfer,
  handed to the PM on site, or not said; since 2026-11-05 also in store, cash at the showroom, cash to the PM on site)
  can be changed, which makes it Custom. The first stage is the
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
  **Automatic, by HST (Albert, 2026-11-05: "when there is no HST at all. The suggested payment method should never be
  e-transfer. and only cash… IF there is an HST on materials. then the auto payment plan should go to 'Materials' first.
  Now; if the value of it is lower than the 35% original, we should also include a breakdown in paying the remaining
  balance 'in-store' but implying it is cash").** A version with no schedule of its own follows `autoSchedule()`:
  nothing priced on any option carries HST → **Cash** (35 / 35 / 30, the deposit in cash at the showroom, the rest in
  cash to the PM on site, no e-transfer anywhere); some option bills HST on its material while other work carries none
  → the **material deposit**, reworked: Materials (the HST-bearing material with its HST) by e-transfer, then **Rest of
  the deposit** in store up to 35% of the total (a `topUp` stage: nothing when the material reaches 35%, and then never
  shown, `shownStage()`), then 35% of the total on the first day (an `ofTotal` stage) and the balance, both to the PM on
  site; otherwise 35 / 35 / 30 by e-transfer. Blank still means automatic, so it follows the quote's HST as lines change;
  picking anything else in the editor stores that one, even 35 / 35 / 30 (`scheduleField()` no longer blanks it), and
  **Use it** goes back. The automatic schedule is frozen on the copy like a picked one (`quoteSchedule()` in `copy.ts`).
  The won email, text and accepted page show a two-part deposit as its parts and how to pay each (`depositParts()` /
  `depositSteps()` / `smsDepositHow()` in `plan.ts`), with the letterhead's address for the showroom. Material
  schedules stored before keep their old stages. **Flagged and blocked (same day: "it should FLAG us if the payment plan
  picked goes against the rules for both", then "it will flag and block the send to prevent instructions from being
  wrong"):** `scheduleFlags()` names e-transfer on a quote with no HST, a material-only-HST quote that doesn't start
  with Materials, and a material under 35% of an option with no top-up after it. The editor's schedule shows them, and
  `sendProblems()` refuses the send with them (checked on the options going, with the schedule they would go with), so
  the Send card says Not ready to send until the schedule is fixed.
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
- **Scopes: flooring and stairs on one quote (Albert, 2026-10-28: "For stair quotes, generally I like to
  keep them separate from the flooring quote. Basically, just create it as an option").** One opportunity
  still has one quote. Each option is **Flooring** or **Stairs** (Quote Options → **Scope**; blank = worked
  out from the lines, Stairs when every priced line is a stair line, `optionScope()` in
  `src/lib/quotes/scope.ts`; the editor's Scope picker sets it; site-sheet options are Stairs). The copy
  freezes it (`CopyOption.scope`, flooring options first) and the page, PDF and email group and label by it.
  A customer accepts **at most one option of each scope** (`pickProblem()`), and the picks become one
  contract: totals added, one schedule restaged on the whole (`frozenStages()`), one Won value, the
  Acceptance record's `picks` and Accepted Option listing both, and `acceptedCopy()` joining them into
  one option (same-name sections together). **Make a change** joins them into one live option, so a change
  stays one option. A preliminary shows each scope's price on its own (`scopeLeads()`: one option's range,
  or "from" the lowest of several). Recommended is one per scope. With both scopes on a quote, the option tabs (quote page and editor) are grouped Flooring | Stairs under small headings (`scopeGroups()`, 2026-10-30). Stairs start their own row under Flooring (2026-10-31). In the editor each scope is a row with its label in a fixed column, and **+ Add option** / **+ From quick form** are their own column on the right behind a light rule (Albert, 2026-11-01), stacked under the tabs on a phone. **Analysis compares each scope apart** (Albert, 2026-11-01: "Analysis should split flooring and stairs comparisons as well"): Options side by side and Where the options differ once per scope, the best figure and "differs" only among like options; one scope reads as before. **The editor's layout is option C (Albert, 2026-11-01: "less AI slop looking, more refined and ease of use"; chosen from three mockups):** Save / Discard (or Save as the next draft) in a header that stays at the top; options in one panel; each work section a block ending in "+ Add to …"; margin under the line total (the card figure is the box's placeholder, spelled out only once typed over or marked up; unit cost went back to its own column beside Unit price the same day, Albert: "Can unit cost and price be on different row"); the sidebar holds the money and a short Customer and terms card whose **Edit terms** opens the full terms (`details#ed-terms`) under the option. Display only: no money, save or Airtable change. Styles under "Editor, option C" in `globals.css`. **Option C is the whole app's look (Albert, 2026-11-01: "match all the screens… so the app stays consistent throughout"):** the quote page uses the editor's header (`.ed-head`, Edit quote at the right) and options panel (`.ed-tabs`, with Rooms / Site sheet / Payouts (2026-11-04) / Photos / Analysis in an `.ed-tools` column), and the "Option C across the whole app" block at the end of `globals.css` sets cards, card headings, buttons, tabs and line tables everywhere. New screens use these classes rather than new ones. **Totals sit at the bottom of the option's lines** (Albert, 2026-11-01: "the totals should be at the bottom for intuitiveness"), right-aligned like an invoice (`.ov-foot`), on the quote page and in the editor (where Accepted price sits under them); Notes / Exclusions follow full width. A stairs option from an older version is
  carried by copying it into a new version; no cross-version picking. Tested in `tests/scope.test.ts`.
- **Won (2026-10-27).** When an accepted quote opens, it reads its opportunity for the PP number and the
  Notion page Make 3710214 writes back after making the project (opportunity fields
  `OPP_FIELDS.projectNumber` and `ACCEPT_FIELDS.notionProjectUrl`), fills them in (blanks only; a PP
  number is never overwritten) and the accepted version becomes **Won**. It keeps looking until it has both (Notion page links are notion.so, notion.site or app.notion.com). Any linked quote without a CompanyCam link copies the opportunity's (2026-10-27: a quote started in the app and never booked has none of its own). All quotes files a quote under
  **Accepted** (yes, no PP number yet) or **Won** (has one). Rule: `projectPickup()` in `src/lib/link/refresh.ts`.
- **Editing a change is marked (Albert, 2026-10-31: "make it a little bit more obvious").** The editor of a change
  carries an amber band pinned to the top ("Accepted quote · Change N", whose accepted quote it is, and the
  difference against the contract with HST), an amber rule down the page edge, and **Save change N** as its save
  button. Display only (`.change-band` in `globals.css`).
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
  **Swap option (Albert, 2026-10-30: "sent for record is fine, accepted version only").** A customer who
  changes their mind about which option they took (the other stairs) gets it as a change: on a draft change
  the editor offers the accepted version's other options of the same scope as a pick (`swapSource()`, found
  by following Supersedes back to the acceptance, `acceptedVersionOf()` in `load.ts`), included lines only.
  The change's lines that came from that pick are ticked to come out (matched by section and wording,
  `swapMatches()`; staff untick or tick), the new option's lines come in as new lines at the prices quoted,
  in place (`swapOption()`), and the option takes the new name, or the new pick's part of a joined name. A
  final payment that would go below nothing is shown before the swap (`swapPreview()`) and still refused at
  send. Nothing new for the customer: the What changed box lists the lines out and in. Rules in
  `src/lib/change/swap.ts`; screen `src/components/editor/SwapOption.tsx`.
  Tested in `tests/change.test.ts`.
- **The contract is a list of pointers (Albert, 2026-10-30; vault `05_decisions/2026-10-30-quote-contract-from-any-version`).**
  Quotes → **Contract** (JSON, app-written) holds what the customer has: one item per option, each pointing at an
  option on some version's frozen copy (version, place in the copy, Quote Options record, name, scope, the add-ons
  taken with it, how and when it got there), with the totals and the payment schedule on the whole. Nothing is merged
  when stored; `contractView()` in `src/lib/contract/model.ts` joins the items into one copy whenever it is needed
  (`acceptedCopy()` is that view of one acceptance). Written only by `src/lib/accept/record.ts` (acceptance; cleared on
  cancel) and `src/lib/quotes/send.ts` (a change sent), pinned by the boundary test; read through `loadContract()` in
  `src/lib/quotes/contract.ts` by Make a change, the change's What changed and invoices / receipts. A quote accepted
  before the field has it blank and reads the same contract from Contract Version (`legacyContract()`), so nothing was
  backfilled. **Contract Version is still written** (the newest version on the contract): the Accepted card, Make a
  change and the billing card are keyed on it. **Step 1 of three, no visible change.** Next: a Part on each option
  (a fixed dropdown; one option per Part) and swapping any option from any version into the contract (step 2); then
  accepting a still-open Part on a later version's link, the schedule restaged on the whole with what Notion's Master
  Payments Log shows received counted toward it (step 3). Tested in `tests/scope.test.ts`.
- **Parts and Not offered (Albert, 2026-10-30; vault `05_decisions/2026-10-30-quote-one-working-quote`).** Each
  option may have a **Part** (Quote Options → Part: Main floor, Upstairs, Basement, Main stairs, Basement stairs;
  `PARTS` in `src/lib/quotes/scope.ts`). Options in one Part are alternatives: the customer accepts at most one per
  Part (`pickProblem()`, up to six in one acceptance), and Recommended is one per Part. No Part = the option's scope
  stands for it (`partKey()` / `partOf()`), so a quote from before Parts still takes one flooring and one stairs
  option; a Part with no Scope set gives the scope (a stairs Part is Stairs). What an option covers in detail goes in
  its description. The copy freezes it (`CopyOption.part`), and the Accept panels group by it (`partKeys()` /
  `partWords()`). **Not offered** (Quote Options → Not Offered) keeps an option on the quote and off what is sent:
  never sent (Albert, 2026-10-31: "as a safeguard, not even an option"): shown greyed and unselectable on the Send card, dropped by `chooseOptions()` even when a send names it (and refused by `sendProblems()`), a grey struck-through tab labelled Not offered and a note above the option.
  Both join the editor's option only when set (absent, never null or false), so drafts saved before them keep their
  fingerprint. Tested in `tests/scope.test.ts`.
- **One working quote (Albert, 2026-10-30; vault `05_decisions/2026-10-30-quote-one-working-quote`).** Staff work on
  one quote and its options; versions are the send history. **No Save as new version button**: a Draft saves in place;
  a sent version's editor saves **as the next draft** (`saveAsNewVersion()`, every option carried over, the basis picked
  beside the button), and only one ordinary draft exists per quote (`workingDraft()` in `savePlan.ts`): the editor of a
  sent version redirects to it (`workingDraftOf()` in `load.ts`), and a save that would make a second one is refused.
  On a conflict (Airtable changed under a draft) the banner offers "Save mine as the next draft", which supersedes the
  other. All quotes lists versions newest first only: the By origin view and "from vN" labels are gone (a change keeps
  "Change N"). This supersedes the 2026-10-28 branching and By origin notes above; changes after acceptance are unchanged.
- **Put on contract, swap from any version, schedule restaged (Albert, 2026-10-30; step 2 of the contract).** Swap
  option on a change offers options of the **same Part** (`partKey()`) from the accepted version and the quote's other
  ordinary versions, newest first (`otherVersionsOf()` in `load.ts`, at most four), each shown once (`sameOption()`:
  name and included lines) and labelled with its version; this replaces "accepted version only" above. **Put on
  contract** on the quote page, on an option not on the contract in a Part the contract covers (`loadContract()`;
  a joined change counts as both scopes), opens the change (Make a change, or the one already open) at
  `/q/<change>/edit?swap=<option id>`, with that option chosen in Swap option. **A change restages the schedule on
  the whole** (`restagedSchedule()` in `src/lib/pricing/schedule.ts`: shares stay shares, a material deposit the
  material, a fixed amount its amount, the last stage the balance), replacing `fixedSchedule()`'s "difference on the
  final payment" for new changes; the change email, PDF and text say what was already paid counts toward it (the
  invoice or receipt shows it). A joined change option takes no Part. Not built (step 3): a Part not on the contract
  offered for acceptance on a later link.
- **What an option can add follows its scope (Albert, 2026-10-30: "For stairs, the only options should be from stair
  items. And the select options should be from the category there"; Stair Items stay their own table, not folded into
  the Rate Card).** `addChoices()` in `src/lib/editor/stairGroups.ts`: a **Stairs** option's Add work is Staircase (the
  builder), one button per Stair Item Category in work order (read from the card, so a new category shows itself),
  Typed line (a manual Stairs line) and Private, whose picker offers Stair Items and typed lines only (`stairsOnly` on
  the Picker); a **Flooring** option gets every work section but Stairs. A section's inline + Add follows the same rule.
  Lines already on an option are untouched. Tested in `tests/stairGroups.test.ts`.
  **Every category present, its add on its heading (Albert, 2026-11-04: "The sections in the stairs should all be
  PRESENT; even when empty. On each section's header, or right under it, should be the add button… it shows up right
  where they picked the item").** In the editor a Stairs option always shows Stairs and Private; Stairs lists every
  category the card offers or a line has, in work order, then Other (typed lines), each heading with its own add
  (`stairSections()`), and, until 2026-11-06, **+ Build a staircase** right under the Stairs header (removed that day, Albert: "You can take away the 'build staircase' option"; the builder is no longer reached from a stairs option). Private's add sits right under its
  header. A stairs option has no Add work bar at the bottom; a flooring option keeps it, unchanged. The quote page and
  customer copy are unchanged (empty groups never show there).
- **After the first acceptance, everything is for the record (Albert, 2026-10-31; vault
  `05_decisions/2026-10-31-quote-changes-for-record`).** The customer accepts once, for the project; every change after
  that is sent for the record with nothing to pick or accept, new work included. This reverses step 3 as built the
  same morning (offers accepted on a change's link, titan-desk PR 107, reverted). On a change the first option is the
  project as agreed and always goes; new work (a basement, an extra) goes on it or as another option after it, with
  or without a Part (`changeProblems()` in `send/plan.ts` refuses only a new option for a Part the customer already
  has, from `contractParts()`). Sending **joins the change's options into one** (`joinChange()` in
  `src/lib/contract/model.ts`: totals added, the version's schedule restaged on the whole), so the page, PDF, email,
  What changed, the contract, GHL's value and invoices see one project, and Make a change later brings back every
  option that change sent. **The options stay apart (Albert, 2026-10-31, later: "all options should stay separate. If it is a
  different option, then in all emails and forms, it will remain separate").** The money is still one contract (one
  total, one schedule, one Won value, one invoice), but `contractView()` no longer merges same-name sections across
  options: each option's sections carry its index (`CopySection.part`) and the joined option lists them in
  `CopyOption.parts` (name, description, price before HST, add-ons taken included). The page, the PDF (and so the
  invoice or receipt) and the change email draw each as its own part ("Your project", Part 1, Part 2…, each with its
  price), through `partGroups()` in `send/copy.ts`; the HST-on-materials band is drawn once, on the last Materials
  section, over all of them. **Make a change** keeps every option the contract has as its own option (`makeChange()`
  in `save.ts`), never one "A + B" option. That replaces the first-option rule above: `changeProblems()` now
  refuses a change that leaves any offered option unticked (it would drop off the contract unseen; remove it in the
  editor instead) and two options for the same Part. A change frozen before this keeps its merged look until a new
  change is sent. Tested in `tests/change.test.ts` and `tests/scope.test.ts`. The change copy carries **what has been paid** (`CopyChange.paid`, read from the Master
  Payments Log at send, null when unreadable), shown as Paid so far and Left to pay (`paidLeft()` in
  `src/lib/change/diff.ts`). The guard is a habit: a change goes out only after the customer's yes in person or by
  phone. Tested in `tests/change.test.ts`.
- **Invoices and receipts (Albert, 2026-10-30).** One numbered document per won project, on its contract
  version (the accepted one or its latest change): an **invoice** (INV-82571, INV-82572…) when the contract charges
  HST on every line, a **receipt** (R-10245, R-10246…) when HST is on part of it (the floor material) or none
  (`billingKind()` in `src/lib/billing/doc.ts`). The numbers come from Airtable: tables **Invoices** and
  **Receipts**, an autonumber Seq and a Number formula (INV- & 82570 + Seq; R- & 10244 + Seq), one row per quote,
  created the first time the document is exported, so a number is never chosen by the app, shared or reused; never
  delete a row. Each export refreshes the row's **Snapshot** (JSON): the contract as accepted (`contractCopy()`), the
  payments read that day from Notion's **Master Payments Log** (rows whose Projects is the quote's Notion project;
  date, amount, form of payment, reference; never the sender's name, message or notes), the HST number
  (`QUOTE_COMPANY_HST`, read again for these documents only) and the PP number. The PDF is the quote's drawing
  titled and numbered as the document, payments received and the balance owing in place of the schedule
  (`billingPdf()`); an overpayment shows as a credit. With HST on the materials only, the HST and "Materials with HST" are rows at the end of the Materials section and every other section heading says NO HST (Albert, same day: less confusion); the Materials section is singled out with a blue bar, HST APPLIES and a tinted band, its lines lose the "plus HST" note, and the totals drop the HST row (later the same day). **Email to customer** attaches it (the second email allowed an
  attachment), served from the customer's link at `/c/<token>/Invoice-INV-82571.pdf` from the Snapshot only. Staff
  card on the quote page (`BillingCard`); writer `src/lib/quotes/billing.ts`. Customer documents only: Lightspeed
  stays the sale of record and the A/R, and nothing posts to QuickBooks or Lightspeed. Tested in
  `tests/billing.test.ts`.
- **The HST flips after a number was issued (Albert, 2026-10-31,** replacing "ask Albert before a second number":
  "the old invoice is considered void… continue creating a receipt", then the same day: "a fluid switch, back and
  forth. Whatever we email through, we'll include. Whatever we don't, stay in the background"). Each kind keeps one
  number on file and the contract's HST decides which is current (`billingPlan()` in `src/lib/billing/doc.ts`):
  exporting reuses this kind's number or issues one; every **emailed** document of the other kind is marked void on its
  Snapshot (`voided`: when, who, replaced by) with a Log line, and its PDF at the customer's old link is drawn with a
  VOID band naming the replacement, while the current one lists "Replaces INV-… (void)" in its header. One never
  emailed is left alone in the background and the customer route won't serve it. Flipping back makes the old number
  current again (its `voided` is cleared, Log says so). Rows are never deleted. The card says what will be voided,
  restored or kept in the background before anyone presses the button. The staff download is the current kind's.
- **An overpayment can read as Paid in full (Albert, 2026-10-31: "in case it backfires on us, I would rather it be
  paid in full").** On an overpaid project the card offers **Show the $… credit on the PDF**, off by default; the choice
  is kept on the document's Snapshot (`creditShown`; missing on older ones, which showed the credit). Off, the PDF lists
  no payment amounts, only "Payment received in full, with thanks" and Paid in full $0.00, and the email drops "Paid so
  far" (`shownTotals()`). Staff still see the real credit on the card.
- **Photos (Albert, 2026-10-30: "display all those photos with their proper timestamps and descriptions,
  mirroring company cam itself").** A **Photos** tab on the quote page, beside Site sheet, staff only, on a quote
  whose CompanyCam link (Quotes → CompanyCam URL, `https://app.companycam.com/projects/<id>`, Make 3453735's
  `project_url`) gives a project id (`projectIdOf()`). Opening the tab reads the project and every photo on it live
  (`src/lib/quotes/companycam.ts`, up to 600, 50 a page), stored nowhere, and lays them out like CompanyCam's timeline:
  by Toronto day, newest first, each with the time taken (else uploaded), who took it, its description and any tags
  CompanyCam includes; a search over those; a viewer with arrows, keys and swipe. A photo's marked-up copy is shown
  when it has one. Read-only: nothing is written to CompanyCam, Airtable or GHL. Each photo keeps its web-size URL so
  a later step can hand stair and measurement photos to Claude (site sheets since 2026-11-03, through the Site sheet
  tab's From CompanyCam, below; measurement photos are not built). Pure reading in `src/lib/companycam/photos.ts`, tested
  in `tests/companycam.test.ts`; screen `src/components/CompanyCamPhotos.tsx`.
- **Payout cards (Albert, 2026-11-04: "we have to also send the contractor a payout form… select the final sent options
  and summarize for the labor-only portions of each line item… multiple payout cards since there may be different
  contractors for each line item… easily check for those said items, add any new lines, edit payout rates; etc. and quickly
  push this to the companycam so it is shareable with the other photos").** A **Payouts** tab on the quote page, staff
  only (it shows what we pay; never in Customer view). **Final options** are ticked: the accepted picks on the accepted
  version, every offered option on a change, else the recommended ones (`defaultOptionIds()`). **Build cards** makes one
  card per contractor (Quote Lines → Contractor, matched without case; lines with none on an unnamed card) from those
  options' lines (`payoutCandidates()` / `groupCards()` in `src/lib/payout/cards.ts`). Chosen by Albert the same day:
  Install, Stairs, Removal, Prep and Disposal lines start **ticked**; Delivery, Other, Private and unsorted lines are
  listed **unticked**; Materials, Discounts and Exclusions never appear; an add-on counts only when the customer took it.
  **The rate starts at our labour cost** (`labourRate()`): a Rate Card line with a swapped material pays the row's cost
  without the material (the card's labour when a cost was typed, as `materialSplit()` reads it); a Stair Item pays its
  Labor Cost without its Material Cost (a line snapped before 2026-10-31 already holds labour only; `getRateCard()` now
  carries `labourCost` on Stair Items); anything else pays the line's cost (override, then snap); a typed whole-line
  cost is spread over the quantity. The quantity is the line's own, **without waste**. Staff tick and untick, retype
  quantity, unit, words and rate (a changed rate shows "was $…" and goes back on a click), add a typed line, move a line
  to another card, add or remove cards, and write a note. Money is `payoutAmount()` / `payoutTotal()` in `calc.ts`
  (quantity × rate to the cent; ticked lines only). Kept on **Quotes → Payouts** (JSON, app-written, compare-and-swap
  like Rooms; `savePayouts()` in `src/lib/quotes/payouts.ts`), so every version shows the same cards; **Build cards
  again** replaces the lines and keeps each contractor's push history. **Push to CompanyCam** (saved cards only, a named
  contractor and every ticked line with words, quantity and rate, `pushProblem()`) draws the card as a JPEG in the
  browser from the saved card (`src/components/payoutImage.ts`, from `cardSheet()`: contractor, customer, site, date,
  PP / Q number, the lines, the total, the note, "Labour only"), posts it to `/api/payout` (signed in; a route because
  the picture is larger than a server action takes), which uploads it to **Quotes → Payout Cards** (attachments, every
  push kept) and hands that file's Airtable address to CompanyCam as a new photo on the quote's own project, tagged
  **Payout**, described "Payout card: <contractor>, $… labour (PP-…)". The push is recorded on the card (when, who, total,
  a signature of what it showed, `pushState()`), so the card says when it went and whether it changed since; **Push
  again** adds a new photo, never replaces one. **One click (2026-11-05):** with unsaved changes the button reads
  **Save and push** and saves the cards first (the same compare-and-swap save), then pushes the card as saved. Preview shows the picture with Download. Not done (Albert, same day: "not
  now"): Notion's Project Costs lines stay by hand. Tested in `tests/payout.test.ts`; screen `src/components/PayoutCards.tsx`.
- **Typed lines saved for next time, and logged (Albert, 2026-11-01: "When we add custom items and the quote ends
  up being SENT… make it so that those items are created for next time use and make them 'require review'… There
  should be a log of where it was used so I can ensure it wasn't wrongly charged").** After a quote is sent (never
  stopping it), each typed line on the options that went out (`sourceKind` manual, priced, with words; never a
  Private line, exclusion or note) is matched by name (case, spacing and punctuation ignored; a Rate Card row also by
  Labor Type) to an existing Rate Card or Stair Items row, Active or not; with no match one new row is made per
  distinct item, **switched off and Needs Review**: Rate Card key "Labor Type | words | (typed)", Labor Type from the
  section (Prep as Install, so the picker shows it there), the unit if the card offers it, Titan Rate the price, the
  cost in Labor Cost (Material Cost for a material), and a Product Note saying which quote and who; a stairs line
  becomes a Stair Item the same way (no category). Existing rows are only linked, never changed. Every typed line is
  linked to its row (Quote Lines → **Custom Rate Item** / **Custom Stair Item**), so the row's **Typed On** and **Typed
  On (detail)** (Quote Lines → Typed Usage: quote, words, unit price, total) are the usage log. Albert approves a row
  by ticking Active and setting OK, and it is then pickable like any other. Pure rules in `src/lib/catalog/typed.ts`,
  tested in `tests/customItems.test.ts`; writer `src/lib/quotes/customItems.ts`.
- **All quotes (2026-10-15).** One row per quote, its versions folded under it (newest first),
  and a search over name, quote and project number, city, email and phone digits. Grouping and
  search are pure, in `src/lib/quotes/group.ts`, tested in `tests/group.test.ts`. Since 2026-10-28
  each version says where it came from ("Change 2 · from v4", `fromLabel()`), read from Quote
  Versions → Supersedes, and the quote page header says the same. A **Versions** toggle switches the
  fold-out between Newest first (the default) and By origin, each version nested under its source
  (`versionTree()`); the choice is kept in localStorage on that device only.

- **Quote Description (Albert, 2026-11-03: "When we are quoting lets say; AMICA Stephen. It is ALWAYS at 200
  Kenneth… But a different unit; or a description of the rooms involved").** Quotes → **Quote Description** (one line,
  at most `DESCRIPTION_MAX` characters, `cleanDescription()` in `src/lib/quotes/group.ts`) is a staff-only label shown
  under the customer's name on All quotes and searched there. Typed on New quote (optional) or in the quote page
  header (`src/components/QuoteDescription.tsx`; click to edit, blank clears it), saved by `saveDescription()` in
  `src/lib/quotes/describe.ts` (a writer, Quotes table only, compare-and-swap like Rooms). Never in Customer view and
  never in the customer copy. It does not change the shared name (`displayName()`), which stays fixed once a folder
  has it. Tested in `tests/group.test.ts` and `tests/link.test.ts`.

- **Report a bug (2026-10-28).** The header's Report a bug (staff only, hidden in Customer view and
  until `NOTION_BUG_TOKEN` is set) posts a summary, an urgency and up to five screenshots (shrunk in
  the browser to stay under Vercel's 4.5 MB body limit) to `/api/bug`. That signed-in route makes
  Albert a Tactical Task through `src/lib/bug/notion.ts`, the only file that writes to Notion (payments are read in
  `src/lib/notion/payments.ts`, hard rule 2f). Rules in
  the repo CLAUDE.md, rule 8.

- **Sand steps → painted risers and stringers only (Albert, 2026-11-06: "Logic to not allow for glue and stain
  stringers when sanding steps! only white stringers or sand and stain stringers. Risers will also only be able to be
  painted white… It should grey the other option out if one is selected. Some sort of flag should be shown in the
  selections").** On one option, sanding the steps (Keep Existing Steps (Sand + Stain), a Sand & stain profile line)
  rules out oak-skinned (Glue and Stain) stringers and every riser that is not Paint Risers White, and either of those
  rules out sanding. Whichever is on the option first wins: the editor's picker greys the other out and says why; a
  line that clashes anyway (added before, or by a profile) carries a red flag in the editor, the builder and the quick
  form. Sanding shows `SAND_DISCLAIMER` wherever it is picked. A flag never stops a save or a send. Items are matched
  by record id first, then name. Rules: `src/lib/editor/sandRule.ts`, tested in `tests/sandRule.test.ts`.
- **Every new line starts at 1 (Albert, 2026-11-06: "All items always start off with value of 1 (for everything)
  unless otherwise edited or entered by another part of the system (aka preliminary quote)").** `NEW_QTY` in
  `lineFromEntry()` and `manualLine()` (`src/lib/editor/model.ts`); the quick form, the builder and the site sheets
  still set their own quantity; exclusions and notes keep none. Replaces the 2026-11-04 flat-row and per-staircase
  rules, which this covers. Tested in `tests/editor.test.ts` and `tests/discounts.test.ts`.
- **The material's math is shown (Albert, 2026-11-06: "sf typed + wastage % = actual sqft. Total is not editable.
  only the sf typed and wastage is").** Under a Materials line's quantity and waste boxes, "820 sf + 10% = 902 sf"
  (`wasteMath()` in `model.ts`, Qty × (1 + Waste) as `calc.ts` prices it); the ordered amount is worked out, never
  typed. The quick form's Material rows show the same line. Tested in `tests/sandRule.test.ts`.
- **The material first when it costs the deposit (Albert, 2026-11-06: "if the material cost is above the 35% or above
  the deposit requirement amount; then the wording should be - purchasing of the flooring material is required first.
  And the selected option of clearing material first is selected").** `autoSchedule()` picks the Material deposit
  whenever an offered option's material (`materialsDeposit()`, after the discount, with its HST) is 35% of its total
  or more, whatever the HST, with the first stage worded `MATERIAL_FIRST_WHEN`, "Purchasing of the flooring material
  is required first" (`materialFirstSchedule()` in `src/lib/pricing/schedule.ts`; paid in cash when nothing carries
  HST). The top-up after it brings any other option up to 35% and is hidden where the material covers it.
  `scheduleFlags()` still checks the HST rules only (`hstSchedule()`), so a schedule picked by hand is never newly
  blocked. Picking the preset the automatic one already is keeps it automatic. Tested in `tests/schedule.test.ts`.
- **The Send card in the editor (Albert, 2026-11-06: "Send option card WITHIN the 'edit' screen is also
  available").** The edit page builds the same card as the quote page (`sendCardData()` in
  `src/lib/quotes/sendCard.ts`, used by both) and the editor shows it under Customer and terms. The editor tells the
  card about its own unsaved changes through `EditorSend` (a same-tab storage read can't see them), so Send is off
  until autosave or Save lands, and each autosave refreshes the card so it checks what Airtable holds. Never in
  Customer view.
- **A stairs option is one section, Stairs: no Private, no separate Other (Albert, 2026-11-06: "any additional work
  PRIVATE section should never show rates. It should be the same as the rule for the stairs items"; then "simply
  eliminate the PRIVATE logic in stairs altogether. Only the OTHER section is visible. and Other section behaves like it
  does as any other section. just a header separation").** Other is the Stairs heading for lines with no Stair Item
  category (+ Add a typed line), like Steps or Landings. `addChoices()` offers a stairs option no Private or Other
  section, and the editor shows none. A line saved on a stairs option in Private or Other is read as a Stairs line
  (`stairsOptionLines()` / `STAIRS_FOLDED` in `src/lib/quotes/scope.ts`, used by `copyOption()`, `OptionSheet` and the
  editor), so it lands under Other and goes as a stair line: words and quantity, no unit price, amount or section
  total; no "Additional work" roll-up. Every section on a stairs option goes that way; add-ons keep their price. Display
  only: the line keeps its saved section, and a section never enters a total. Flooring options are unchanged. Tested
  in `tests/send.test.ts` and `tests/stairGroups.test.ts`.

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
   all of this.
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
   cancel, and the acceptance messages) and `src/lib/quotes/billing.ts` (the invoice or receipt email).
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
