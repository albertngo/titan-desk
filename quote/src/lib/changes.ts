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
