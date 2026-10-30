/**
 * What's new: the app's change history, newest first, shown at /changes (Albert, 2026-10-27:
 * "I work with a lot of sessions, it's hard to keep track").
 *
 * Every piece of work that changes what staff or customers see or what the app does adds one
 * entry at the TOP of this list, in the same commit (quote/CLAUDE.md, "What's new"). Plain
 * words, for the person using the app, not the code. Pure data; tests/changes.test.ts keeps it
 * dated and in order.
 */

export type ChangeKind = "new" | "changed" | "fixed" | "removed";

export type Change = {
  /** YYYY-MM-DD, Toronto. */
  date: string;
  kind: ChangeKind;
  title: string;
  /** One line each: what it does and where to find it. */
  details: string[];
};

export const CHANGES: Change[] = [
  {
    date: "2026-10-30",
    kind: "changed",
    title: "Receipts show the HST inside the Materials section",
    details: ["On a receipt where HST is charged on the materials only, the HST and the materials' total with HST sit at the end of the Materials section, and every other section is marked no HST."],
  },
  {
    date: "2026-10-30",
    kind: "new",
    title: "Invoices and receipts for won projects",
    details: [
      "A won quote's page has an Invoice or Receipt card: an invoice (INV-82571 and on) when HST is on every line, a receipt (R-10245 and on) when HST is only on the materials or not charged.",
      "It lists every payment linked to the project in Notion's Master Payments Log and the balance owing. Create it to get its number, Open PDF to download it, or Email to customer to send it with the PDF attached. Updating it later keeps the number and adds newer payments.",
    ],
  },
  {
    date: "2026-10-30",
    kind: "changed",
    title: "Send again on accepted and won quotes",
    details: ["Send again… is on an accepted or won quote's Sent to customer card too. Include the PDF sends a link to the signed, accepted PDF."],
  },
  {
    date: "2026-10-30",
    kind: "new",
    title: "Send again, with or without the PDF",
    details: [
      "A sent quote's Sent to customer card has Send again…: it sends the same link by email and/or text, for when the customer lost it or asks for the PDF.",
      "Include the PDF turns on Download PDF on their page, if the quote went without it, and puts the PDF's link in the message. Nothing else about the quote changes: same price, link and good-until date.",
    ],
  },
  {
    date: "2026-10-30",
    kind: "changed",
    title: "Option tabs split into Flooring and Stairs",
    details: ["When a quote has both, the option tabs on the quote page and in the editor are grouped: Flooring first, then Stairs, each under its own small heading with a line between them."],
  },
  {
    date: "2026-10-29",
    kind: "changed",
    title: "Site sheet: bigger numbers on the sheet copy",
    details: ["What was written on the sheet (counts, lengths, the quote number, notes) shows in a larger hand, and the printed labels are a little larger too, so the check reads easily on a computer."],
  },
  {
    date: "2026-10-29",
    kind: "changed",
    title: "Site sheet: check what was read on a copy of the paper sheet",
    details: [
      "What Claude read is drawn as the Stair Site Sheet itself, section for section and box for box, with each page beside its photo.",
      "Tap a bubble or a tick to mark it, tap it again to clear it, and type into any box. Anything Claude wasn't sure of is shaded yellow.",
      "On a phone the page keeps its shape and scrolls sideways.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "changed",
    title: "Stairs: grouped by category, one nosing line, and always one price",
    details: [
      "The Stairs section on the quote page and in the editor is split under small headings by each Stair Item's Category in Airtable (Steps, Landings, Accents, Railing, Tasks…).",
      "A stair built from the site sheet has one nosing line in feet, at the Accents: Nosing rate. Picket-hole nosing is the same item.",
      "Send breakdown itemises the flooring only. Stairs always go to the customer as one price.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "fixed",
    title: "Site sheet: Build stair options opens the editor with the options in it",
    details: ["The button opened the editor without the new stair options. They now arrive there as unsaved changes, priced from Stair Items, ready to review and save as a new version."],
  },
  {
    date: "2026-10-28",
    kind: "changed",
    title: "Site sheet: spindles at 3 a foot, and the rail check on the total",
    details: [
      "Spindles are worked out as 3 for every foot of handrail with pickets, on the steps and flat alike. A count written on the sheet still wins when it's higher.",
      "The rail on the steps is checked as the runs added together, not run by run, so a staircase railed in two pieces isn't flagged twice.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "fixed",
    title: "Site sheet: reading no longer trips over Claude's limits on the field list",
    details: ["Read stopped with \"too many parameters with union types\". The field list now goes to Claude as part of the instructions, and the app checks every value it gets back, as before."],
  },
  {
    date: "2026-10-28",
    kind: "fixed",
    title: "Site sheet: the sheet's field list is accepted by Claude",
    details: ["Read stopped with \"Invalid schema: Enum value 'Straight'…\". Fields that can be left blank are now described the way Claude accepts."],
  },
  {
    date: "2026-10-28",
    kind: "fixed",
    title: "Site sheet: reading the photos works with the current Claude model",
    details: ["Read stopped with \"tool_choice … not supported for this model\". The sheet is now read as one JSON answer held to the sheet's fields, which this model supports."],
  },
  {
    date: "2026-10-28",
    kind: "fixed",
    title: "Site sheet: user keys from the Anthropic Console are accepted",
    details: ["The reading key check refused keys starting sk-ant-usr-, which the Console now gives out. Any Anthropic key is accepted; Anthropic itself says if one is wrong."],
  },
  {
    date: "2026-10-28",
    kind: "fixed",
    title: "Site sheet: a second photo now adds on",
    details: ["Taking or choosing another photo adds it beside the ones already there (up to 4), instead of replacing them."],
  },
  {
    date: "2026-10-28",
    kind: "fixed",
    title: "Site sheet: both pages at once, and a clear message when reading isn't set up right",
    details: [
      "Take a photo adds one page at a time; Choose photos picks several from the library. Each one shows as a thumbnail (Page 1, Page 2) with a × to remove it, then Read reads them all together.",
      "When the reading key on the server is set wrong, the tab now says what is wrong with it instead of showing a technical error.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "new",
    title: "Flooring and stairs on one quote, one of each accepted",
    details: [
      "Every option is Flooring or Stairs. The editor sets it for you from the lines (Auto), and the Scope picker beside Recommended changes it. Options built from the site sheet are Stairs.",
      "The customer sees the options grouped under Flooring options and Stairs options. They can accept one of each, or just one of them, and the two become one contract: one total, one deposit, one schedule, one Won in GHL.",
      "A preliminary shows each scope's price on its own, in the email, the text and on the page. Several options in a scope read \"from\" the lowest.",
      "Recommended is now one per scope. Make a change on a quote accepted this way starts from both options joined into one.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "changed",
    title: "Site sheet v5: fewer choices for the PM",
    details: [
      "Pie steps and bullnoses are counted by open side only (LSO, RSO, 2 side open). The open side gives a pie step's turn. A 2-side-open bullnose is priced as custom.",
      "Pizza sets: how many, 2-pc or 3-pc, and one 2-side-open tick. A 2-piece set, or a 3-piece set that is 2 side open, adds the custom corner turn upcharge.",
      "Nosings: the default says whether carpet is on them now, plus thickness and depth. A piece only gets its own depth or thickness when it differs.",
      "Railing: brackets are worked out from the wall runs (the first 1 ft in, then one every 2 ft). There's a new tick for a metal bar under the handrail. The complex handrail choice is gone.",
      "What the customer wants: vinyl treads and vinyl steps are separate options. There's a Square off bullnose tick, and riser and stringer colours are White, Stain or Not sure.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "changed",
    title: "Site sheet v4: simpler nosings and railing",
    details: [
      "Nosings: one default line for the staircase (what it is now, thickness, depth), then just a length per piece. A piece only says more when it differs, and Sand is ticked only for a piece being kept.",
      "Railing: one column per run, with its length, whether it's on the steps, flat or along a wall, curved or not, and pickets. Spindles and holed nosings are now worked out from these runs.",
      "Curved handrail is priced from its own new Stair Item (left blank for its price). Stringers say White or Coloured instead of White or Oak.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "changed",
    title: "New stair items, waiting for their prices",
    details: [
      "Ten items the Site sheet needs are now in Airtable's Stair Items with blank prices, among them carpet off the stairs, vinyl treads, vinyl flooring on steps, painting risers white and refinishing posts.",
      "Fill in each one's Titan Rate and Cost and the stair options built from a site sheet price it straight away. Until then it comes in with no price and a note.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "new",
    title: "Site sheet: upload the stair sheet and get priced stair options",
    details: [
      "A quote has a Site sheet tab. Photograph both pages of the paper stair site sheet and press Read the sheet; about a minute later every box is filled in beside the photos.",
      "Check each field against the photo (anything it wasn't sure of is marked in yellow), fix what's wrong, and press Save check.",
      "It works out risers, spindles, picket heights and oak boxes, and warns when something doesn't add up, like a spindle count lower than the steps suggest.",
      "Build stair options adds one option per tread choice the customer ticked (new caps, sand and refinish, vinyl) to the editor, priced from the Stair Items card. Sanding isn't offered over carpet. Anything with no rate on the card comes in with no price and a note.",
      "The photos stay on the quote in Airtable, so the sheet can always be checked again.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "fixed",
    title: "Glue and other install materials are now added to the price",
    details: [
      "A Rate Card line with a Material picker (glue-down installs, cork, glue assist) now adds the picked material's price and cost on top of the labour rate. Before, the line showed labour only.",
      "Lines already on a quote keep their old figures until you pick the material again (or remove and re-add the line).",
      "The material has its own small Unit cost and Unit price boxes under the line's, with the labour shown beside them. Type one to change just the material; clear it to go back to the card.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "changed",
    title: "A tidier top bar",
    details: [
      "The top bar is grouped: Customer view, then What's new and Report a bug, then you, with a thin line between them.",
      "Your email and Sign out are now under your initials at the right.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "changed",
    title: "The Notion project links to the quote in this app",
    details: [
      "When a quote is accepted, or a change is sent after it, the Notion project's Quote Link now opens the quote here, with all its details, instead of the customer's accepted page.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "new",
    title: "Report a bug",
    details: [
      "Report a bug in the header (here and in the desk) sends Albert a bug with a one-line summary, how urgent it is and up to five screenshots.",
      "It lands on the Tactical Tasks list as \"BUG FIX: Desk App (Quotes) …\", assigned to Albert, with the screenshots and the page you were on.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "changed",
    title: "Each version says where it came from",
    details: [
      "In All quotes, the versions under a quote say which one they were made from (\"from v8\"), and a change after acceptance says its number too (\"Change 2 · from v4\").",
      "The quote page says the same under the customer's name, and no longer shows the version number twice.",
      "Versions: Newest first or By origin, above the list. By origin puts each version under the one it was made from, like sub-pages. This device remembers the choice.",
    ],
  },
  {
    date: "2026-10-28",
    kind: "fixed",
    title: "One change at a time on an accepted quote",
    details: [
      "Make a change opens the change you already started instead of starting another, and changes are numbered by the ones actually sent.",
      "Save as new version is gone from a change and from the accepted quote: either would have gone out as a fresh quote to accept. A change is saved with Save, and the next one starts from Make a change.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "fixed",
    title: "Won quotes link their Notion project, and quotes pick up the job's CompanyCam",
    details: [
      "Notion's new page links (app.notion.com) were being ignored, so a won quote showed its PP number but no Notion project link. They're taken now, including on quotes that already have their PP number.",
      "A linked quote with no CompanyCam link copies the one on its GHL opportunity, for example from an earlier booking.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "removed",
    title: "No HST number on quotes",
    details: [
      "The customer's page, the PDF and the email no longer show the HST registration number: a quote is an estimate, not an invoice. Quotes already sent lose it too.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "fixed",
    title: "The price and payment schedule no longer overlap",
    details: [
      "On the customer's page the price comes first and the payment schedule sits under it, full width, so long notes like \"On acceptance, to secure your materials…\" wrap instead of running into the price.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "new",
    title: "Customers can accept a quote",
    details: [
      "A measured quote's link has an Accept panel: the customer picks the option, ticks any add-ons, agrees to the Project Expectations and types their name.",
      "In store, press Accept with customer on the quote page to open it on the tablet, where they also sign. Or Record acceptance for them, with where their written yes is.",
      "On acceptance GHL moves to Project Won at the total with HST, and the customer gets the accepted PDF, the Project Expectations and the deposit request.",
      "Switched on and off in Airtable: Quote Settings → Online Acceptance.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "new",
    title: "Payment schedule you can edit",
    details: [
      "Each quote has a payment schedule in the editor: 35/35/30 by default, 25/25/25/25, 50/50, or your own shares.",
      "When some work carries no HST, it suggests a material deposit by e-transfer, with the rest handed to the project manager on site.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "new",
    title: "Change an accepted quote",
    details: [
      "Make a change on an accepted quote starts Change 1, 2, …, keeping the agreed stages; the difference goes on the final payment.",
      "Sending it gives the customer the full updated quote with a What changed box at the top. Nothing for them to approve.",
      "Cancel acceptance (with a reason) sets the quote and the GHL opportunity to lost.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "changed",
    title: "Won and the PP number are picked up",
    details: [
      "Once the Notion project exists, opening an accepted quote fills in its PP number and Notion link and shows it as Won. All quotes files it under Accepted or Won.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "changed",
    title: "Add work shows only that section's work",
    details: [
      "Install, Stairs, Removal, Disposal, Prep, Materials, Delivery and Other each open on their own items from the rate card, not the whole card.",
      "Need something from another section? Tick Search the whole rate card in the picker. Private still lists everything.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "changed",
    title: "Waste % on materials only",
    details: [
      "Only lines in Materials have a waste % box. Install, removal and other work lines no longer show one, and adding one from the rate card no longer brings a default waste.",
      "A line saved with waste before today keeps its box so you can see it and clear it.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "changed",
    title: "Preliminary estimate email: clearer header, one booking link",
    details: [
      "The email now opens with a solid blue PRELIMINARY ESTIMATE tag, so customers can't mistake it for a measured quote.",
      "The extra Book an in-store visit button under the steps is gone. Book a showroom visit on step 1 does the same thing.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "changed",
    title: "What's new moved to the top bar",
    details: [
      "What's new is now a small link in the top bar, between Customer view and your email, on every page. It's hidden while Customer view is on.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "new",
    title: "What's new",
    details: [
      "A What's new button on the Quotes page opens this history of every change to the app, newest first.",
      "Each session that changes the app adds its entry here, so the list stays current without anyone keeping track by hand.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "changed",
    title: "Open notes tag the contact's assigned person",
    details: [
      "On a measured quote, the GHL notes for a first open and the three-day summary tag whoever is assigned to the contact (else the opportunity's, else Albert), whoever sent it.",
      "When someone else sent the quote, the sender is tagged too.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "changed",
    title: "The PDF stays out of the email",
    details: [
      "The email never carries the PDF; the customer page offers Download PDF only when it is ticked on the Send card.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "new",
    title: "Opens and downloads are tracked",
    details: [
      "The customer page counts an open once it has been in view for a moment; link previews and mail scanners don't count.",
      "A version's first open posts an internal comment in GHL, and a summary follows three days after sending.",
      "All quotes has a Last opened column, and opened versions are marked in each quote's version list.",
      "Sending sets the follow-up tag (quote sent: preliminary / measured) that starts the GHL follow-up workflow.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "new",
    title: "Rooms tab",
    details: [
      "A room-by-room measurement log on the quote: one measurement per room, total square feet, with linear feet kept beside it.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "new",
    title: "Address arrived",
    details: [
      "A quote booked without an address reads the customer's messages for one and fills it in as Unconfirmed, with a banner saying what was filled.",
      "Check it and press Confirm address to put it on the opportunity.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "changed",
    title: "Preliminaries go out as a range",
    details: [
      "A preliminary is always a lump sum, shown as a range from 3% under to 10% over (capped at $3,000 over), with an option to send the exact price.",
    ],
  },
  {
    date: "2026-10-27",
    kind: "new",
    title: "Where did they find us?",
    details: [
      "A preliminary's customer step asks where the customer found us and records it in GHL (Quote Origin and Source). Neighbour Ad is on the list.",
    ],
  },
  {
    date: "2026-10-24",
    kind: "changed",
    title: "Sending: choose options, prices before HST",
    details: [
      "Choose which options go to the customer; three or more list compactly.",
      "Every amount in the email, text, customer page and PDF leads with the price before HST.",
      "A preliminary opens generically unless the sender says we have visited. The Questions? card is gone from the customer page.",
    ],
  },
  {
    date: "2026-10-23",
    kind: "new",
    title: "Measurement booking link in the preliminary email",
    details: ["The preliminary's email carries the in-home measurement calendar link. The brand logo now ships with the app."],
  },
  {
    date: "2026-10-22",
    kind: "new",
    title: "Branded quote email",
    details: ["The quote email is branded and sent from the signed-in quoter, with an edit history."],
  },
  {
    date: "2026-10-22",
    kind: "new",
    title: "Lump sum, Private section and accepted price",
    details: [
      "Lump sum is the default, chosen on the Send card; the customer sees descriptions, then the price.",
      "A Private section rolls up into one Additional work row for the customer; the preliminary's additional cost goes there.",
      "Accepted price, before HST, under each option sets the discount in dollars, with a reason. The Analysis tab shows what happens if they accept a price.",
      "A preliminary has no good-until date.",
    ],
  },
  {
    date: "2026-10-22",
    kind: "changed",
    title: "Preliminary form: baseboards and mouldings",
    details: [
      "Baseboards default to a third of the install square feet and follow it until typed. Up to three moulding rows.",
      "A material choice is priced from its product; a linked Rate Card row is only a fallback.",
    ],
  },
  {
    date: "2026-10-22",
    kind: "changed",
    title: "Layout on a wide screen",
    details: [
      "New quote puts the conversation beside the form; the right column follows the scroll; the photo strip stays at the top.",
      "The Open in Airtable button is gone from the quote page.",
    ],
  },
  {
    date: "2026-10-21",
    kind: "new",
    title: "Fix address",
    details: ["Fix address beside the address opens the place a wrong address is put right: the GHL contact, the opportunity, or the Notion project."],
  },
  {
    date: "2026-10-20",
    kind: "new",
    title: "Customer conversation",
    details: [
      "The customer's GHL conversation, read-only, as a side drawer on the quote page, the editor and New quote. Emails open as a peek; arrow keys step through photos.",
    ],
  },
  {
    date: "2026-10-20",
    kind: "new",
    title: "Stair profiles and the stair builder",
    details: [
      "Staircases on the preliminary are picked from preset profiles with set prices.",
      "In the editor, a profile opens the builder (steps, open sides, handrail, spindles, posts) and can replace the preliminary's preset line.",
    ],
  },
  {
    date: "2026-10-18",
    kind: "new",
    title: "The mobile quote moves into the app",
    details: [
      "+ Preliminary quote runs Job, then Customer, then Timeline, laid out for a phone, with a rate and total beside every row. The GHL mobile-quote workflow is retired.",
      "+ New quote starts a measured quote that opens empty in the editor. Stairs is its own section again.",
    ],
  },
  {
    date: "2026-10-16",
    kind: "new",
    title: "Premium, crews and materials",
    details: [
      "Premium service level (labour at the card rate +15%).",
      "Pick a crew for the whole option and override single lines.",
      "HST per material line, and swappable install materials.",
    ],
  },
  {
    date: "2026-10-15",
    kind: "new",
    title: "Send to customer",
    details: ["Send a quote by email and/or text with a link to the customer's page, through GHL."],
  },
  {
    date: "2026-10-15",
    kind: "new",
    title: "Linking, addresses and Customer view",
    details: [
      "Link to Opportunity on a quote that needs linking. Confirm address for a site checked without a booking.",
      "All quotes groups versions under their quote, with a search bar.",
      "The Customer view switch in the top bar hides every internal figure.",
      "Bookings from GHL create the quote and never reuse a won, lost or STORE opportunity.",
    ],
  },
  {
    date: "2026-10-14",
    kind: "new",
    title: "New quote and saving",
    details: [
      "New quote screen with quote numbers and a GHL customer lookup that never duplicates a contact.",
      "The editor saves to Airtable; a sent version changes only by Save as new version.",
      "Quotes are named First Surname - MMYY - Q-1234, and the customer's details follow GHL each time a quote opens.",
    ],
  },
  {
    date: "2026-10-12",
    kind: "new",
    title: "The editor and the dashboard",
    details: [
      "The editor, keeping drafts on the device.",
      "Dashboard redesign: cards, a financials sidebar, the quote overview, one light look on every device.",
    ],
  },
  {
    date: "2026-10-11",
    kind: "new",
    title: "Titan Quotes goes live",
    details: ["The quoting app as its own deployment, reading quotes from Airtable."],
  },
];

export const KIND_LABEL: Record<ChangeKind, string> = { new: "New", changed: "Changed", fixed: "Fixed", removed: "Removed" };

/** Entries grouped by day, newest day first, keeping the list's order within a day. */
export function byDay(changes: Change[] = CHANGES): { date: string; changes: Change[] }[] {
  const days: { date: string; changes: Change[] }[] = [];
  for (const c of changes) {
    const last = days[days.length - 1];
    if (last && last.date === c.date) last.changes.push(c);
    else days.push({ date: c.date, changes: [c] });
  }
  return days;
}

/** "Mon Oct 27, 2026" for a YYYY-MM-DD, without the server's time zone moving the day. */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
