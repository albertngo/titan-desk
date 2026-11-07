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
    date: "2026-11-07",
    kind: "fixed",
    title: "Material rates show in Customer view on a lump sum",
    details: ["The quote page's Customer view now shows each flooring material's rate beside its quantity on a lump sum and on a preliminary, as the customer's link and PDF already did."],
  },
  {
    date: "2026-11-07",
    kind: "changed",
    title: "+ From Quick Form, and Preliminary or Measured on every new quote",
    details: [
      "The front page's + Preliminary quote button is now + From Quick Form.",
      "Both new-quote screens ask This quote goes out as: Preliminary or Measured, starting on Preliminary. A measured one from the quick form gets Delivery on its flooring options.",
      "After a quote is sent, The next draft is still starts on Measured and can be Preliminary, so several preliminaries can go out.",
    ],
  },
  {
    date: "2026-11-07",
    kind: "changed",
    title: "Preliminary stairs: one standard line per staircase, and the customer gets the wording only",
    details: [
      "The quick form adds each staircase as one Stair Item in the new Stair Profile category, at the old preset price, never broken into steps and risers. Stair Profile is the first heading under Stairs.",
      "On a preliminary, a stairs option goes to the customer as its wording and price range only, with no lines.",
      "The wording names each staircase profile on the option with its words, and is rewritten when the staircases change. Edit it in the Customer wording box; the Send card shows it word for word before it goes.",
    ],
  },
  {
    date: "2026-11-07",
    kind: "changed",
    title: "No section totals for the customer",
    details: ["A breakdown sent to a customer no longer shows a subtotal on each section (Install, Materials and so on): each line keeps its amount and the price block has the total. On the link, the PDF and Customer view. Staff screens keep the section totals."],
  },
  {
    date: "2026-11-07",
    kind: "fixed",
    title: "Easier-to-read text on staff screens",
    details: ["Staff screens are back on the computer's own font (Segoe UI on the store's Windows PCs), with bolder names and headings and no text smaller than 13. The customer's quote keeps its brand fonts."],
  },
  {
    date: "2026-11-07",
    kind: "new",
    title: "Company files: download the site sheets",
    details: ["Company files, beside What's new in the top bar, downloads the latest Flooring Site Sheet and Stair Site Sheet, each on its own, with its version shown. A new version appears there by itself."],
  },
  {
    date: "2026-11-07",
    kind: "changed",
    title: "The app wears Titan's colours",
    details: [
      "The mascot and the Titan Quotes name sit in the top bar; the app's blue stays.",
      "Colour is kept for problems: Needs linking, Expires and Not opened chips stay tinted, the rest are quiet text with a dot. The Financials card keeps its rings and coloured figures.",
      "On a quote page, Accept with customer is now a plain button, so Edit quote is the one main action.",
    ],
  },
  {
    date: "2026-11-07",
    kind: "changed",
    title: "The customer's quote looks like Titan",
    details: [
      "The link a customer opens now has the Titan Flooring logo, the website's cream and navy, the customer's name and the price in the brand's headline font, and the mascot signing off at the bottom.",
      "The price is the one large figure on the page; the solid blue bar is gone. The PDF and the email are unchanged.",
    ],
  },
  {
    date: "2026-11-07",
    kind: "changed",
    title: "The stairs fee is the Delivery line",
    details: ["A new stairs option now starts with the same $200 Delivery line as flooring, in its Private section, so the customer never sees it. The separate Stair base fee item is switched off."],
  },
  {
    date: "2026-11-07",
    kind: "new",
    title: "Stair Site Sheet v7",
    details: [
      "Custom treads are written as how many at (full length x full depth). 2 side open treads are riser to riser only: write how many at the riser length; the 36, 42 and 48 boxes are shaded.",
      "A 2 side open bullnose has its own box, B8a, with a drawing and its four measures: riser to riser, tread depth, nose reach and ear. The quote flags any that are blank.",
      "An other-size landing is written as length x width. Landings and stringers are now at the top of page 2. The Site sheet tab shows v7; photos of a v6 sheet still read. Print the new sheet from quote/sheets/stair-site-sheet-v7.pdf.",
    ],
  },
  {
    date: "2026-11-07",
    kind: "changed",
    title: "Private says what each way of sending shows",
    details: [
      "In the editor, a flooring option's Private section has a Breakdown / Lump sum switch, starting on the way the last version went: Breakdown shows the one line the customer sees (Additional work $350); Lump sum says it is not shown, its amount inside the one price. On a preliminary, Breakdown can't be picked. Its lines are never listed and never show quantities.",
      "A stairs option's Private section says outright it is never shown to the customer: not on a breakdown, a lump sum, the PDF or the email.",
      "The Send card says the same under Pricing shown, as Flooring Private, for the choice you have picked and the options you are sending, and adds that stairs Private never shows when a stairs option is going.",
    ],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Delivery and the stair base fee are added for you",
    details: [
      "Every flooring option on a measured quote starts with a $200 Delivery line, which the customer sees. Remove it if the job has none. A preliminary has no delivery; saving a preliminary as the measured next draft adds it to each flooring option.",
      "Every stairs option starts with a $200 stair base fee in its Private section, even before any stairs are added. The customer never sees it: it is inside the stairs price.",
    ],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Private is back on stairs options, and every Private section says what the customer sees",
    details: [
      "A stairs option has a Private section again, for staff only: a red note says it is never shown to the customer and its amount is inside the stairs price.",
      "On a flooring option, a purple note under Private shows the one line the customer sees (Additional work, or the name you give it) and its total; the lines below it are never listed.",
    ],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Send starts the way the last version went",
    details: ["The Send card now says how the last version went out (a lump sum or a breakdown; for a preliminary, a range or an exact price) and starts on the same choice. Change it if this one should go differently."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "No option is marked Recommended for you",
    details: ["Options from the quick form and the site sheets start unticked. Tick Recommended in the editor if you want one."],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Material square feet are checked against the install",
    details: ["Each option's material (with its waste) should be 10 to 15% over the install's square feet. Outside that, the editor flags the option and it can't be sent; press OK, it's right if it is, and Send opens again. Change either square footage afterwards and the flag comes back. An option with no material isn't checked."],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Moulding is its own section",
    details: ["Baseboards, shoe mould, casing, quarter round and transitions now sit in their own Moulding section, right under Install, on the quote, the customer's copy and the PDF. On the quick form the Baseboards group is called Moulding. In the editor, + Add to Moulding lists them and Add to Install no longer does. Lines already on a quote stay where they are."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Flooring and stairs are separate options from the quick form",
    details: ["A quick-form tab with both a floor and a staircase now makes two options, the flooring and the stairs, so the customer can take one without the other. The editor's + From quick form does the same."],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Change a material's price on the preliminary",
    details: ["The material card has a Price box. Leave it blank for the usual price, or type the price for this quote; it goes on the quote line like a price typed in the editor."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Click installs, and 8mm and 9mm vinyl",
    details: ["Laminate | Vinyl | Eng Click is now two installs: Vinyl / Laminate Click (suggests 7mm Standard Vinyl) and Engineered Click (suggests Engineered Click). There are new 8mm and 9mm Standard Vinyl materials."],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Material goes with each install",
    details: [
      "On the quick form (and + From quick form in the editor) each install now asks Material: Needed or Not needed. Needed opens a green material card that starts on the install's usual material; pick another material or product there.",
      "The material's square feet are always the install's plus the waste (10%, 15% for herringbone and tile), and change when the install's do. Once picked, the card folds to one line; Change opens it. Changing the install type moves the material to that install's usual one. The separate Material section is gone.",
    ],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Herringbone: pick the method, then the glue",
    details: ["Herringbone is now one choice on the quick form and in the editor's Add to Install, with its methods underneath: Click, Staple + glue assist and Full gluedown. The glue methods then ask for the type of glue. Prices are unchanged."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Full gluedown lines name the wood",
    details: ["Full gluedown and Nail + full gluedown now say Solid Hardwood T&G or Engineered T&G, like the other methods, at the same prices as before."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Clearer line names for installs and glue",
    details: [
      "T&G and glue-down lines now read like \"Solid Hardwood T&G install · Nail + glue assist · Glue: Silane, Bona R850T or equivalent\", on screen and on everything the customer gets. Hover a line to see its rate card name.",
      "The words come from Customer Wording on the Rate Card and on Install Materials in Airtable, so they can be changed there. Lines already on a quote keep their old name until they are added again or their glue is changed.",
    ],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Type the method and the glue; the unit works itself out",
    details: ["On a glue line in the editor, unit cost and unit price are now two boxes each, Method and Glue, and the unit under them is their sum. Leave a box blank to use the card. Picking another glue keeps a method you typed."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Glue lines show Method + Glue = Unit",
    details: ["Under a glue line's unit cost and unit price, the editor now lays the figure out as a sum: the method's labour, plus the glue (still editable), equals the unit. The total is always what the line charges."],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Change a line's method in the editor",
    details: ["A T&G line now has a Method list (Nail down, Nail + glue assist, Full gluedown, Nail + full gluedown). Switching keeps the quantity, area, note and crew. The glue stays when the new method uses the same glues; otherwise you pick one. A typed price is cleared, since it was for the other method."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "The glue is never picked for you",
    details: [
      "On the quick form and in the editor, a glue-down line starts with no glue. Until you pick one it is priced at labour only and says Pick the glue.",
      "Create (and Add this option) waits until every glue is picked, and a quote can't be sent while any line still needs one.",
    ],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Nail + glue assist is one line",
    details: ["Solid and Engineered T&G with Nail + glue assist now go on the quote as one line with one square footage, at the same price as before, with the glue picked on it. Quotes made before keep their two lines."],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Add T&G in the editor the same way: wood, method, glue",
    details: [
      "In the editor, + Add to Install now lists Solid Hardwood T&G and Engineered T&G at the top. Pick one, then how it's installed, then the type of glue. Nothing is picked for you, and Add waits until you have chosen.",
      "The separate T&G and glue rows no longer show in that list. Tick Search the whole rate card to see them.",
    ],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Glue: Provided by Client, and what each choice adds",
    details: [
      "Every type of glue now has Provided by Client as its last choice: the line is the install labour only and says the client provides the glue. It works on the quick form and in the editor's material list.",
      "On the quick form, each glue beside the one picked shows how much more or less it is per square foot.",
    ],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Full gluedown + nail is now Nail + full gluedown",
    details: ["The same T&G method under a new name, on both Solid Hardwood T&G and Engineered T&G. The price is unchanged."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Quieter T&G options",
    details: ["The methods and glues under a T&G pick are now plain small text with no outline. The one picked is lightly tinted blue."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "The T&G options read as sub-categories",
    details: ["Under Solid Hardwood T&G or Engineered T&G, the methods and the type of glue are now smaller pills, stepped in under the pick they belong to, so the big buttons stay the main choice."],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Hardwood T&G: pick the wood, the method, then the glue",
    details: [
      "On the quick form, Install now has one Solid Hardwood T&G and one Engineered T&G. Pick one and its methods appear under it: Nail down, Nail + glue assist, Full gluedown, Full gluedown + nail.",
      "A glue method then asks Type of glue, starting on the usual one. The glue's price goes on top of the install, so the preliminary includes it (before, a glue-down preliminary priced the labour only). The editor shows the same glue on the line.",
    ],
  },
  {
    date: "2026-11-06",
    kind: "removed",
    title: "No Build a staircase on stairs options",
    details: ["The + Build a staircase link is gone from a stairs option in the editor. Add stairs from each heading instead (+ Add to steps, + Add to landings…)."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Quieter stairs add buttons",
    details: ["The add beside each stairs heading is plain blue text again, with no outline or fill. It stays right next to the heading."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Stairs add buttons next to each heading",
    details: ["In the editor, each stairs heading's add (+ Add to steps, + Add to landings…) now sits right beside the heading as a blue button instead of at the far right. + Build a staircase and + Add to other look the same."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Stairs options have no Private or Other section",
    details: [
      "A stairs option is just Stairs now: Other is its last heading, like Steps or Landings, with + Add a typed line. There is no Private section on a stairs option any more.",
      "Lines that were saved in Private or Other on a stairs option show under that Other heading. The customer sees each one with its quantity and no rate, like every stair line, instead of one Additional work row with an amount. The option's price is unchanged. Flooring options keep their Private section as before.",
    ],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Send from the editor",
    details: ["The Send card now sits in the editor's sidebar, under Customer and terms, as well as on the quote page. Sending is off while the editor has unsaved changes and comes back once they save."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "The material first when it costs the deposit",
    details: [
      "When an option's material comes to 35% of its total or more, the automatic payment schedule now asks for the material first, worded \"Purchasing of the flooring material is required first\". With no HST on the quote, it is paid in cash.",
    ],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Waste worked out on material lines",
    details: ["A material line shows its math under the quantity, for example 820 sf + 10% = 902 sf. Type the square feet and the waste; the rest is worked out. The preliminary's Material rows show it too."],
  },
  {
    date: "2026-11-06",
    kind: "changed",
    title: "Every new line starts at 1",
    details: ["Anything picked or typed into a quote now starts at quantity 1. The preliminary, the stair builder and the site sheets still put in their own amounts."],
  },
  {
    date: "2026-11-06",
    kind: "new",
    title: "Sand steps: painted risers and stringers only",
    details: [
      "On an option with sanded steps, oak-skinned (glue and stain) stringers and any riser other than Paint Risers White are greyed out in the picker, and the other way round. A line that clashes anyway gets a red flag.",
      "Sand steps show a note saying risers are painted white only and stringers are painted white or sanded and stained.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "changed",
    title: "A wrong payment schedule stops the send",
    details: [
      "A payment schedule that goes against the HST rules no longer just warns: the quote can't be sent until it is fixed. The editor's payment schedule says what to fix, and the Send card lists it under Not ready to send.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "changed",
    title: "Texts only from the sender's own number",
    details: [
      "A text now goes out only from the GHL number of the person it is sent as, the same rule as the email and its address. If their GHL user has no number of its own, the Text tick is greyed out and says so; give that user a number in GHL (Settings, My Staff, LC Phone). Before, GHL picked a number itself, which could be someone else's.",
      "The thank-you text after a customer accepts follows the same rule.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "new",
    title: "A payment schedule that breaks the HST rules is flagged",
    details: [
      "The editor's payment schedule and the Send card now say Check the payment schedule when the schedule picked goes against the rules: e-transfer on a quote with no HST, or a quote with HST on the material only that doesn't start with the material, or leaves the deposit under 35% with nothing paid in store. It can still be sent.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "new",
    title: "Send as on invoices and receipts",
    details: [
      "Email to customer on the invoice or receipt card has Send as too, starting on you, the same list as the Send card.",
      "The Send card now says plainly that someone with no GHL number of their own texts from whichever number GHL picks, which can be another person's.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "changed",
    title: "Payment schedule follows the HST",
    details: [
      "A quote with no HST at all is now paid in cash: the deposit at the showroom, the rest to the project manager on site. No e-transfer is mentioned anywhere the customer looks.",
      "When only the material carries HST, the material comes first by e-transfer. If it comes to less than 35%, the rest of the deposit is paid in store. Then 35% on the first day and the balance at the end.",
      "This happens by itself until you pick another schedule in the editor. Use it puts it back.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "fixed",
    title: "The accepted email and text come from whoever sent the quote",
    details: [
      "The thank-you email and text after a customer accepts now come from the address and the GHL number of the person who sent that quote, and are signed with their name. Before, they could come from another address while signed by someone else.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "new",
    title: "Everyone can choose who a quote is sent as",
    details: [
      "Send quote and Send again have Send as for everyone now. It always starts on you; pick someone else and the email, the text and the signature are all theirs. Albert is on the list only for Albert.",
      "The card also says who sent this quote last, and when.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "fixed",
    title: "Pictures attach to the quote again",
    details: [
      "Airtable refused every picture the app tried to keep on a quote, so a payout card couldn't be pushed to CompanyCam, and site sheet photos never reached the quote's Site Sheet Photos and Flooring Sheet Photos fields. They now attach, and Push to CompanyCam carries on to CompanyCam.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "fixed",
    title: "Push to CompanyCam works without saving first",
    details: [
      "On the Payouts tab, Push to CompanyCam stayed greyed out until Save cards at the bottom was pressed. It now reads Save and push when there are unsaved changes, and saves the cards before it sends the card.",
      "When the quote has no CompanyCam project linked, the card now says so under the button.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "changed",
    title: "Work tabs show only their own content",
    details: ["Rooms, Site sheet, Payouts and Photos no longer have Send quote, History and the other quote cards under them. Those are still on every option's tab and on Analysis."],
  },
  {
    date: "2026-11-05",
    kind: "new",
    title: "Material follows the install, with waste added",
    details: [
      "On the quick form, a Material row now follows the install square feet like Baseboards does: pick the total or one Install row from the small chips under it, and it keeps up as you change the install. Typing your own amount stops it following.",
      "Material goes on the quote with 10% waste, or 15% for herringbone and tile. The square feet stay the floor's; the waste is in the line's waste % box in the editor, where you can change it. The row's rate says how much waste it includes, and its total counts it.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "changed",
    title: "Baseboard ⅓ choices are quieter",
    details: [
      "Under a Baseboards row, the ⅓ of ___ sf choices are now small outlined chips, with the one it follows lightly tinted, so the baseboard type above stays the main choice.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "new",
    title: "Sort All quotes by any column",
    details: [
      "Click a column heading on All quotes (Customer, Quote, Current version, Last opened, Attention, Created) to sort by it; click it again to turn it round. The arrow shows which one is sorting.",
      "Quotes with nothing in that column (no number, never opened, nothing needing attention) always sit at the bottom.",
      "On a phone the headings are hidden, so there is a Sort menu under the filters. Your choice is remembered on that device.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "new",
    title: "Drafts save themselves",
    details: [
      "While you edit a draft, it saves to Airtable a few seconds after you stop. The header says Saving…, then Saved and the time. Save still saves straight away and opens the quote.",
      "A quote that has been sent doesn't autosave: its Save starts the next draft, so that stays a button. If someone else changed the draft in Airtable, autosave stops and says so rather than saving over their work.",
      "With no signal the work stays on this device (the header says Offline) and saves once the connection is back. History gets one line per sitting, not one per save.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "new",
    title: "No sending while there are unsaved changes",
    details: [
      "If the editor holds changes on this device that haven't been saved, Send quote and Send again are greyed out, with a note saying when the changes were kept and a link back to the editor.",
      "Save the changes (or discard them) and sending comes back. Changes kept on another phone or computer aren't seen here.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "changed",
    title: "The staff link is on the contact's Notes too, with the quote and version",
    details: [
      "The comment a send posts now starts with the quote and version (\"Q-1234 v2\"), then Staff Link to Quote and Edit the Quote.",
      "The same words go on the GHL contact's Notes tab, so the link is in both places. Quotes still out with the customer got the note as well.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "changed",
    title: "The quote link is an internal comment again, two lines",
    details: [
      "Right after a quote's email or text goes, the customer's GHL conversation gets an internal comment: \"Staff Link to Quote:\" (opening it is never counted as the customer's open) and \"Edit the Quote:\" (the quote here). Nothing else, nobody tagged.",
      "It no longer goes on the contact's Notes tab.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "changed",
    title: "The quote link note goes on the contact's Notes",
    details: [
      "The note a send adds, with the customer's staff link and the quote's page here, is now a note on the GHL contact's Notes tab instead of a comment in the conversation.",
      "Quotes still out with the customer got the same note on their contact.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "new",
    title: "Quotes sent before today got their link note",
    details: [
      "Every quote still out with the customer that was sent before today now has the same GHL note a send posts: who sent it, the customer's staff link (not counted as an open) and the quote's page here.",
      "Replaced versions got none, since their link only says a newer quote exists.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "changed",
    title: "Quote open notes no longer tag anyone",
    details: [
      "The GHL notes when a customer first opens a quote, and the summary three days after sending, now just inform: nobody is tagged, so nobody gets a GHL notification for them.",
      "They still land on the customer's conversation with the same words.",
    ],
  },
  {
    date: "2026-11-05",
    kind: "new",
    title: "A GHL note with the quote link when you send",
    details: [
      "Sending a quote now posts an internal comment on the customer's GHL conversation: which quote went, by whom and how, the customer's link and the quote's page in this app.",
      "The customer's link in that note is the staff one: opening it shows exactly what the customer sees and is never counted as their open. Nobody is tagged.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "new",
    title: "Albert can send as someone else",
    details: [
      "Signed in as Albert, the Send card and Send again have a Send as list: anyone who can sign in to the app with a Titan address. Picking someone sends from their email, their GHL number and signed with their name, and the card shows which.",
      "Nobody else sees the list, and the app refuses a send as someone else from any other sign-in. The History still says Albert pressed Send.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "Texts go from your own GHL number",
    details: [
      "A quote text now goes from the number your GHL user has, found by the email you sign in with: Pourya's from Pourya's, the front desk's from the front desk's, Albert's from Albert's. Send again does the same.",
      "The Send card says which number it will use. Anyone whose GHL user has no number of its own still texts from the main GHL number, as before.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "new",
    title: "Set HST for all options at once",
    details: [
      "Beside Charge HST (13%) on this option in the editor's terms, Set HST for all options opens a check first: each option's HST now and its total with HST on and off. Choose Charge HST on all or No HST on any, or Cancel to change nothing.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "HST is set per option",
    details: [
      "Charge HST (13%) in the editor's terms now applies only to the option you are on. Each option keeps its own, so one option can charge HST and another not.",
      "The option's totals, payment schedule, the customer's link, PDF and email, and invoices or receipts all follow that option's own HST. Options you never changed keep the quote's setting, so nothing already made moves.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "Stair groups stand out more",
    details: [
      "In the Stairs section of the quote page and the editor, each group heading (Steps, Landings, Railing and the rest) is now a grey band with a blue bar on the left and a little space above, so it is easier to see where each group starts.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "Stair items have their own units",
    details: [
      "Each stair item now says what its quantity is counted in: steps, sets (corner pieces), ft (nosings, handrails, trims) or pcs (spindles, pickets, posts). Stringers, landings and the complex handrail show the number only.",
      "The unit follows the item everywhere: the editor, the quote page, the customer's link and PDF, the preliminary form, the site sheet build and payout cards. Stair lines on quotes made before show the new units too. Change an item's unit in Airtable, Stair Items, Unit.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "Quantities always show for the customer",
    details: [
      "Every line on the customer's link, the PDF and Customer view now shows its quantity, in every section, whether the quote goes as a lump sum, a breakdown or a preliminary.",
      "Stairs still never show a price per line, but each stair line now shows how many (for example 13 piece). A change to a stair count is listed in What changed.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "An accepted price stays put",
    details: [
      "Once you set an accepted price on an option, nothing else moves it: adding or removing a discount, the Contractor / Standard / Premium slider, or changing lines. The option's discount and margin change instead, and the card says it is Held.",
      "A change that would take the price under the accepted price is not made, and the editor says so. Press Reset in the price card first to change the price.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "Accepted price is per option, and discounts are dollars only",
    details: [
      "An accepted price now changes only the option you type it on. Its discount is a dollar line on that option, like a discount item, and the customer sees it as \"Discount\" with the reason you give it. It can't go above the quote, and Reset clears that option only. Other options keep their own price.",
      "A quote saved before this kept one discount for every option. The first time you set or reset an accepted price on it, each option keeps the dollars it had.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "new",
    title: "Payout cards for contractors",
    details: [
      "A Payouts tab on every quote. Tick the options the customer is getting (what they accepted is ticked for you) and press Build cards: one card per contractor, listing their labour lines at what we pay for each, with materials left out.",
      "On each card, tick or untick lines, change a quantity or rate (a changed rate shows what it was), add a line, move a line to another contractor's card, or add a card. Save cards keeps them on the quote, so every version shows the same cards.",
      "Preview shows the card as a picture you can download. Push to CompanyCam adds it to the job's photos, tagged Payout, so it can be shared with the rest. The card then says when it went and whether it has changed since.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "The Private section stands apart",
    details: ["On the quote page and in the editor, the Private section sits a little further down, greyed out under a thin violet line with a PRIVATE tag, so it is obvious those lines are never itemised for the customer."],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "The accepted price can't go above the quote",
    details: [
      "The accepted price, total discount % and margin % can only bring the price down from what the slider and the discounts make. To charge more, add a Private line or raise a rate. The card says so if you try.",
      "Discounts in the price card are in dollars only.",
      "Clearing any of the three accepted price boxes is the same as pressing Reset.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "Bins start at one",
    details: ["A disposal bin or any other flat-priced item picked in the editor goes in at a quantity of 1, as it already does from the preliminary. The general bin is now $400 on the Rate Card."],
  },

  {
    date: "2026-11-04",
    kind: "changed",
    title: "Stringers start at quantity 1",
    details: ["Adding a stringer item charged per staircase (paint white, oak skin, or sand and stain) puts it in at a quantity of 1. Change it if the job has more."],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "Stairs options show every category, each with its own add",
    details: [
      "In the editor, a stairs option now always shows its Stairs section with every Stair Item category (Steps, Bullnoses, Risers, Landings, Accents, Railing, Tasks and the rest) as its own heading, even when nothing is in it yet. Each heading has its own add button, so what you pick lands right under it.",
      "Build a staircase sits right under the Stairs heading, typed lines go under Other, and Private (also always shown) has its add right under its heading. The Add work row at the bottom is gone on stairs options; flooring options keep it.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "No em dashes",
    details: ["No screen, email, text, page or PDF uses an em dash any more, including words typed into Airtable before a customer sees them."],
  },
  {
    date: "2026-11-04",
    kind: "new",
    title: "A price card under each option",
    details: [
      "Discounts on the left: add as many as you need by name, in dollars or as a percent (like 5%). They stay until you remove them, and the customer sees each one by name above the price.",
      "Accepted price on the right: type the price before HST, the total discount % or the margin %, and the other two follow. While it is set, moving the slider or the discounts keeps that price. Reset, or clearing any of the three boxes, goes back to the slider and the discounts.",
      "Under it, the cost, profit and margin at that price. The (i) shows the lowest price that keeps the 20% margin minimum.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "new",
    title: "Contractor pricing",
    details: ["The service level slider has Contractor to the left of Standard and Premium: 10% off the whole option, shown as its own discount and kept up to date as the lines change."],
  },
  {
    date: "2026-11-04",
    kind: "removed",
    title: "Discount % in the terms",
    details: ["The terms no longer take a discount percent. Discounts are made in the option's price card, so there is one place to look."],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "Quotes go only from the person sending",
    details: [
      "A quote, a resend, an invoice or a receipt is emailed from whoever is signed in and presses Send, and from nobody else. If GHL can't send from your sign-in, the email doesn't go and the Send card says so; the text still can.",
      "The front desk (info@) signs its emails and texts as Joey.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "Materials always show their rate",
    details: ["On every quote the customer gets, lump sum and preliminary included, each material line shows its rate per unit beside the quantity. The PDF heads that column Rate."],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "Baseboards follow the install, row by row",
    details: [
      "On the preliminary's Job card, the first Baseboards row is a third of all the Install square feet added up, and it keeps up as the install changes. Type your own number and it stays as typed.",
      "Under each Baseboards row, pick what it follows: ⅓ of the total, or, with two or more Install rows, ⅓ of one of them (for example ⅓ of 500 sf (Hardwood)). A second or third row starts on nothing until you pick one, so nothing is counted twice.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "Smaller words and cards on a phone",
    details: [
      "On a phone, text, cards and the quick form's choices are a size smaller, so more of the quote fits on the screen. Boxes you type in stay the same size, so the iPhone doesn't zoom in, and everything is still easy to tap.",
    ],
  },
  {
    date: "2026-11-04",
    kind: "changed",
    title: "More of the screen for the work on a phone",
    details: [
      "On a phone the estimate at the bottom of a new quote is one row now: the price on the left and the Create button on the right, without the line under it.",
      "The menu along the bottom of a phone is gone. The top bar is back instead, as on a computer: Titan Quotes takes you to the quotes, and Customer view, What's new, Report a bug and your account are at the top right. Start a quote from the Quotes page.",
    ],
  },
  {
    date: "2026-11-03",
    kind: "fixed",
    title: "Site sheets: the photo beside the sheet, Draw again and Start over",
    details: [
      "Draw from CompanyCam image on the Flooring sheet checks CompanyCam again every time it opens, so it no longer opens empty, and says so when the job has no photos.",
      "After a sheet is drawn, each page shows the photo it was read from beside it (the flooring sheet's at the top). If the copy didn't attach to the quote, CompanyCam's own photo is shown instead of a blank space.",
      "Once a sheet is read, Draw again from CompanyCam image opens with the same photos ticked, and Start over clears what was read so you can draw or read it fresh. The photos stay on the quote.",
      "The Flooring sheet now reads left to right like the Stair sheet: the photo, the sheet as drawn, then What it builds with Build flooring options, Save check and Copy rooms, which stay in view as you scroll (on a phone they come first). When nothing could be read from the photo, it says so.",
      "Sheets drawn from CompanyCam are read from the full photo, made sharp enough to read, instead of CompanyCam's small 400-pixel copy, and the photo beside the sheet is the full one too. If only the small copy can be had, the app says so.",
    ],
  },
  {
    date: "2026-11-03",
    kind: "changed",
    title: "Pick the pipeline and stage for a new opportunity",
    details: [
      "Choosing \"+ New opportunity\" on Link to Opportunity now shows a Pipeline and a Stage to pick from, so the opportunity goes exactly where it belongs (for example the Sales Pipeline at Meeting (Scheduled)).",
      "It starts on Lead Qualification at the quote's timing stage, as before, when the quote has a timing. Only the project pipelines are offered, and never Project Won: a quote gets there when the customer accepts it.",
    ],
  },
  {
    date: "2026-11-03",
    kind: "changed",
    title: "Both site sheets take photos the same three ways",
    details: [
      "The Flooring sheet now has Take a photo and Choose photos, like the Stair sheet, beside Draw from CompanyCam image. Pick or take the photo, then Read the sheet.",
      "Draw from CompanyCam image is a button on both sheets now, next to the other two.",
    ],
  },
  {
    date: "2026-11-03",
    kind: "changed",
    title: "Analysis on a phone reads as cards",
    details: [
      "On a phone the Analysis tab's tables, and the If they accept a price table, show each figure as a card with one line per option, so nothing scrolls sideways. \"Where the options differ\" marks each card differs or same.",
    ],
  },
  {
    date: "2026-11-03",
    kind: "changed",
    title: "On a phone: a menu along the bottom, and lines as cards",
    details: [
      "On a phone the top bar is replaced by a bar along the bottom: Quotes, New (preliminary or measured), Customer view, and More for What's new, Report a bug and signing out.",
      "In the editor and on the quote page each line is now a card: the item on top, contractor, quantity, cost and price two to a row, and the line total at the bottom. No more scrolling sideways.",
      "All quotes, the Rooms, Site sheet, Photos and Analysis buttons, and every box and button across the app are bigger on a phone, and typing no longer makes the iPhone zoom in. Computers and tablets look the same as before.",
    ],
  },
  {
    date: "2026-11-03",
    kind: "new",
    title: "See which version of the app you're on",
    details: [
      "A thin line at the very top of every page says which update is running: its PR number and title, when it was last updated, and the commit, each linking to GitHub.",
      "If it doesn't match the latest change you expect, the app hasn't picked up the update yet: reload. It is hidden in Customer view.",
    ],
  },
  {
    date: "2026-11-03",
    kind: "new",
    title: "Site sheets straight from CompanyCam, and the flooring sheet read into rooms and options",
    details: [
      "The Site sheet tab now starts with the Flooring sheet. On a quote with a CompanyCam project, click Draw from CompanyCam image, pick the photo (photos tagged or described \"Site Sheet\" are ticked for you), and it's read. The stair sheet has the same link beside its upload buttons, so the photos never need uploading twice.",
      "What was read is drawn as the paper Flooring Site Sheet itself, box for box, with anything Claude wasn't sure of in yellow: tap a bubble or tick to change it, type in a box to fix it, then Save check. Open image (a new tab) and Open in CompanyCam at the top show the photo it came from.",
      "Copy rooms to the Rooms tab puts the sheet's rooms there (it replaces what's on the Rooms tab). Build flooring options prices the sheet the way a preliminary is priced and adds the options to the editor, where you review and save them. Different floors on different levels are one option; a room ticked for both floors (or left blank with two floors written) gives two options to compare.",
    ],
  },
  {
    date: "2026-11-03",
    kind: "changed",
    title: "New quote on a phone has more room too",
    details: [
      "The Job step's quick form matches the editor's: bigger choices two to a row, bigger boxes to type in, and each work section's name above what's in it.",
      "Option tabs sit two to a row, and the estimate and Create stay at the bottom of the screen with the price set large.",
      "The customer and timeline steps get bigger buttons and boxes. Computers and tablets look the same as before.",
    ],
  },
  {
    date: "2026-11-03",
    kind: "changed",
    title: "The editor on a phone has more room",
    details: [
      "On a phone the header is shorter: Save sits beside the customer's name, and Discard only shows once there are changes to discard.",
      "The Conversation button now sits under the header instead of on the edge of the screen, so it no longer covers buttons.",
      "+ From quick form opens full screen, with bigger choices two to a row and the estimate, Cancel and Add this option kept at the bottom.",
      "Customer and terms shows once, and options sit two to a row. Computers and tablets look the same as before.",
    ],
  },
  {
    date: "2026-11-03",
    kind: "changed",
    title: "New opportunity stands apart from the existing ones",
    details: [
      "On Link to Opportunity and on New quote's customer step, \"+ New opportunity\" now sits under an \"or\" line with a dashed blue outline, so it's clear it makes a new opportunity rather than picking one of the customer's.",
    ],
  },
  {
    date: "2026-11-03",
    kind: "new",
    title: "Make a new opportunity from Link to Opportunity",
    details: [
      "A quote that says Needs linking now has \"+ New opportunity\" under the customer's opportunities. Pick it when the quote is a different job from all of them (another unit at the same building, another address), then press Create and link.",
      "The opportunity is made the way a preliminary's is: in Lead Qualification at the stage the quote's timing gives (Hot, Warm or Cold), named like the quote, with the quote number, the site if it's confirmed and the CompanyCam link. If the quote has no timing yet, the card asks.",
    ],
  },
  {
    date: "2026-11-03",
    kind: "new",
    title: "A description for each quote",
    details: [
      "Give a quote a short description, like \"Unit 1204 · kitchen + hall\", and All quotes shows it under the customer's name. Several quotes for one customer at the same building are now easy to tell apart.",
      "Add or change it at the top of the quote page (click \"+ Add a description\", or click the description to edit it), or type it in the Description box on New quote. Search finds it too.",
      "Staff only: the customer never sees it, and it isn't in the quote link, PDF, email or text.",
    ],
  },
  {
    date: "2026-11-02",
    kind: "changed",
    title: "Preliminary stairs add their Stair Items",
    details: [
      "Picking a staircase on a preliminary now adds that staircase's Stair Item lines (steps, risers, spindles and so on, from its Stair Profiles row) priced from the card, instead of one line at a fixed price. The form shows what it adds and the total.",
      "The measured quote is the same lines with the counts corrected. Two staircases of the same type are labelled Main stairs 1 and Main stairs 2.",
      "Each Stair Profiles row now has preset counts in Airtable: boxed, open-side and curved steps (each with its own Per … step link, so each type is priced as its own piece), landings (with Per landing), handrail feet, nosing feet (with Per nosing ft), spindles and posts. Until a row's Stair Items are linked it still adds one line at its old stored price.",
    ],
  },
  {
    date: "2026-11-02",
    kind: "new",
    title: "Customers see one line per kind of stair work",
    details: [
      "Give a Stair Item a Customer Wording in Airtable (for example \"Solid red oak tread caps\" on every step piece) and the customer's quote link, PDF and email show all those pieces as one line with that wording, quantities added. Boxed, open-side and pie steps no longer show as separate things.",
      "Your screens still show every piece. Items with no Customer Wording show their own name, as before.",
    ],
  },
  {
    date: "2026-11-02",
    kind: "removed",
    title: "Preliminary stairs: Different price",
    details: ["The Different price box under each staircase is gone. Change a quantity or price in the editor instead, as on any quote."],
  },
  {
    date: "2026-11-01",
    kind: "changed",
    title: "Editor: unit cost in its own column again",
    details: ["In the editor, Unit cost is its own column beside Unit price again, instead of sitting under the price. The margin stays under the line total."],
  },
  {
    date: "2026-11-01",
    kind: "new",
    title: "Typed lines are saved to the Rate Card for review",
    details: [
      "When a quote is sent, each typed line on it (one not picked from the Rate Card or Stair Items) is saved there for next time: switched off and marked Needs Review, with a note saying which quote it came from. Tick Active and set it to OK in Airtable to make it pickable.",
      "If a row with the same name already exists, nothing new is made. Either way, the row's Typed On column lists every quote line that used it, with the price charged, so you can check nothing was charged wrongly.",
    ],
  },
  {
    date: "2026-11-01",
    kind: "changed",
    title: "Totals at the bottom of the option",
    details: [
      "On the quote page and in the editor, the option's totals (pre-discount, discount, subtotal, HST and the total) now sit at the bottom of its lines, right-aligned like an invoice, instead of in a card beside the notes. In the editor, Accepted price sits right under them.",
    ],
  },
  {
    date: "2026-11-01",
    kind: "changed",
    title: "One look across the app",
    details: [
      "Every screen now follows the editor's new layout: cards with plain headings, softer buttons, and one light-blue selected state for every tab.",
      "The quote page has the same header as the editor, with Edit quote at the top right, and the same options panel: Flooring and Stairs rows on the left, Rooms, Site sheet, Photos and Analysis in a column on the right. Its line table shows each work section as its own block.",
    ],
  },
  {
    date: "2026-11-01",
    kind: "changed",
    title: "Editor: a cleaner layout",
    details: [
      "Save and Discard sit at the top of the editor and stay in view as you scroll. The options are one panel, and each work section is its own block that ends with + Add to that section.",
      "Unit cost now sits under the unit price and the margin under the line total, so the table is narrower. The card figure shows inside the box and is spelled out only when you type over it.",
      "Customer and terms moved to a short card on the right; press Edit terms to open the discount, HST and payment schedule under the option.",
    ],
  },
  {
    date: "2026-11-01",
    kind: "changed",
    title: "Analysis: flooring and stairs framed apart",
    details: [
      "The flooring and stairs comparisons on the Analysis tab are each in their own framed box with a heading.",
    ],
  },
  {
    date: "2026-11-01",
    kind: "changed",
    title: "Analysis compares flooring and stairs apart",
    details: [
      "On a quote with both flooring and stairs options, the Analysis tab shows Options side by side and Where the options differ once for the flooring options and once for the stairs options, so the best margin and the differences are only ever between like options.",
    ],
  },
  {
    date: "2026-11-01",
    kind: "changed",
    title: "Editor: adding an option sits on the right",
    details: [
      "In the editor, + Add option and + From quick form are now their own column on the right, behind a light line, instead of sitting in the row with the Flooring and Stairs tabs.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Customer's quote: each group of options in its own frame",
    details: [
      "On the customer's link, Flooring options and Stairs options are each a framed section with a clear heading, with space between the two. The option buttons and the chosen option's details sit inside the same frame, so it is plain which details go with which options. A quote with one kind of option shows the same frame headed Your options.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Customer's quote: smoother switching, clearer layout",
    details: [
      "Tapping another option on the customer's link swaps the details in place with a short slide, and the page stays exactly where it was: no more landing somewhere odd.",
      "Each option now reads as three separate cards: the option itself, What's included, and Price and payment, with plainer headings in normal case instead of small capitals.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Stairs options on their own row",
    details: [
      "On a quote with both flooring and stairs options, the Stairs tabs now start a new row under the Flooring tabs on the quote page and in the editor, instead of sitting far off to the right.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Customer's quote: options side by side",
    details: [
      "On the customer's link, the options are a row of buttons at the top. Tapping one shows that option's work and price right underneath, so nobody scrolls down to find it. It starts on the recommended option. Printing still shows every option.",
      "The page is easier to read: slightly bigger text and darker grey for the small print.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "fixed",
    title: "Stair items cost labour plus material",
    details: [
      "A stair line's unit cost now adds the Stair Item's Material Cost to its Labor Cost, so the margin is right. Lines already on a quote keep the cost they were added with: rebuild the option from the Site sheet, or type the cost, to update them.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Site sheet: spindles at 2 a foot on the steps",
    details: [
      "Spindles are now worked out as 2 for every foot of handrail with pickets on the steps, and still 3 a foot on flat runs. A count written on the sheet still wins when it's higher.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Stair Site Sheet v6",
    details: [
      "The printed site sheet is now v6: count boxes you can fill in parts, the pizza row as 2-pc and 3-pc counts with \"of these sets →\" for 2 side open, and a Staircases box under Stringers. The Site sheet tab shows v6. Photos of a v5 sheet still read.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Site sheet: custom pieces, landings, stringers and step widths",
    details: [
      "A custom corner turn set or a solid half moon now replaces the standard piece instead of being added on top. A 2-side-open bullnose is the custom bullnose, with nothing extra.",
      "A 3 × 6 landing is its own item (two 3 × 3s). Steps get one line per width (36\", 42\", 48\"), all at the same price. Stringers are one per staircase, both sides; a new Staircases box under Stringers takes more, like 1.5.",
      "Carpet removal is no longer a line on stair options: it isn't charged.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Site sheet: Build stair options is never blocked",
    details: [
      "Build stair options works as soon as a sheet is read: no Save check needed first, and edits you made on the sheet are kept.",
      "Every option the customer ticked is built, even one the checks advise against (sanding over carpet, vinyl treads on a curve). It says why on a Not advised note and is never the recommended one. With nothing ticked under G1, every option is built. The checks are there to inform; remove what you don't want in the editor.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "fixed",
    title: "Site sheet: stair options priced from Stair Items again",
    details: [
      "Build stair options had left most lines unpriced (risers, landings, nosing, handrail, stringers and more) because the Stair Items had been renamed. Every line now links to its Stair Item, and renaming an item in Airtable no longer breaks it.",
      "New wood spindles are now the one wood spindle item (material and stain included), not iron spindles plus a stain.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "fixed",
    title: "Site sheet: iPhone photos (HEIC) read",
    details: [
      "Photos of the site sheet from an iPhone (HEIC) showed as broken images and Read failed with \"The server didn't answer\". Each photo is now turned into a small JPEG as soon as it is picked, so the preview shows and the photos send. The Read button says \"Getting photos ready…\" while that happens.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Site sheet: the pizza 2 side open box points at its sets",
    details: [
      "On the Pizza set row, the 2 side open box now reads \"of these sets →\": write how many of the 2-pc and 3-pc sets beside it are 2 side open. They are part of those sets, not extra.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Site sheet: pizza sets say which are custom",
    details: [
      "Pizza set: write how many 2-pc and 3-pc sets, and under 2 side open how many of those sets are 2 side open. Every 2-pc set and any 2 side open set is custom, and the row now shows how many custom sets that makes.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Site sheet: tread boxes add up; pizza sets by 2-pc and 3-pc",
    details: [
      "On the Site sheet tab, the tread grid (36\", 42\", 48\", Other) and the pie, pizza and bullnose boxes take a count in parts, like 4+3+2, and show the total beside it. The boxes are a little wider. Claude adds up numbers written in parts in one box on the paper too.",
      "Pizza set: the 2 side open box is now how many of the sets are 2 side open (no tick), and Pizza only has a 2-pc box and a 3-pc box instead of one sets box. Sheets read before keep their sets.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "removed",
    title: "One Send button on a draft",
    details: [
      "The Send quote to customer button under the quote overview is gone. Send from the Send quote to customer card beside the quote, which was already there; Edit stays under the overview.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Send quote to customer; no Edit on a change already sent",
    details: [
      "The button under a draft and the Send card beside it now say Send quote to customer.",
      "A change that has been sent, or replaced by a later change, no longer shows Edit. It stays as the customer received it, so the editor could never save it. Make a change, or open the newest change, to edit.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Options stay separate on an accepted quote and its changes",
    details: [
      "When the customer has more than one option (say upstairs and the basement, or flooring and stairs), each one now keeps its own heading, description, work and price before HST on the quote page, the PDF, the invoice or receipt and the change email. Before, all their lines were run together in one list under a name like \"Upstairs + Basement\".",
      "There is still one total and one payment schedule for the whole project.",
      "Make a change now keeps each option as its own option in the editor, instead of joining them into one. Every option on a change goes to the customer, and no two options can be for the same part of the home.",
      "A change already sent before today keeps how it looked. Make a change from it and send again to show the parts separately.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Editing an accepted quote is clearly marked; open counts always show",
    details: [
      "In the editor of a change, an amber band stays at the top of the screen (\"Accepted quote · Change 2\", whose quote it is and how far the total moves), the page has an amber edge, and the button says Save change 2.",
      "On All quotes, every version shows how many times the customer opened it, one open included, and when last. A new draft no longer blanks Last opened: it shows the newest version the customer has, labelled with its version number.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "The quote email gives the price, the quote page gives the rest",
    details: [
      "The email no longer lists what each option includes (install, square footage, materials, timing). It shows the price or range and says what's included, the materials and the payment schedule are on the quote page, so the customer opens it to see them.",
      "Two options are now listed the same way as three or more: each option's name and price in one short list. One option gets a single card with its price and the price with HST.",
      "The quote page and the PDF are unchanged.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Several options: \"from as low as\" in the email and the text",
    details: [
      "When a quote goes with two or more options, the email and the text now say \"There are 3 options for you to take a look at, from as low as $2,000 + HST\", using the lowest price (the low end of the lowest range on a preliminary).",
      "Fixes a preliminary text with several options, which quoted only the first option's range as if it were the only one.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Not offered can't be sent; preliminary and old links are obvious",
    details: [
      "A Not offered option is greyed out, struck through and labelled Not offered on its tab, with a note above it. On the Send card it is shown but can't be ticked, so it can never go to the customer. Untick Not offered in the editor to send it.",
      "A preliminary's customer page and PDF now open with the same solid blue PRELIMINARY ESTIMATE tag as the email.",
      "A customer opening an older, replaced link sees a bold \"This is an older version of your quote\" box with a See the newer quote button.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "Send again: shorter messages, and right after sending",
    details: [
      "Send again… now shows on the Sent to customer card as soon as a preliminary or measured quote is sent, without reloading the page.",
      "The message is one short line and the link: \"Here's your quote again\", \"Here's your accepted quote again\" on an accepted or won quote, and \"Here's your updated quote again\" on a change after acceptance. With Include the PDF it carries the PDF's link too.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "New work after acceptance is for the record, nothing to accept",
    details: [
      "Replaces the two entries below. On a change, new work (a basement, an extra) goes on the first option or as another option after it; everything on the change becomes part of the project when you send it. The customer gets the updated quote for their records, with nothing to pick or accept.",
      "The updated quote shows what changed, the new total, the payment schedule on the whole project, what has been paid so far and what is left (from Notion's Master Payments Log).",
      "Only send a change once the customer has said yes in person or by phone. A new option for a part of the home they already have is refused: put that work on the first option.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "changed",
    title: "New work without a Part is an addition",
    details: [
      "When you add new work to an accepted project, the Part is optional. Leave it blank and the option is an addition on its own: the customer can tick any or all of them, beside a choice for a Part.",
      "Give options the same Part (Basement, Main stairs…) only when they are alternatives for that area.",
    ],
  },
  {
    date: "2026-10-31",
    kind: "new",
    title: "Add new work to an accepted project",
    details: [
      "On a change, the first option is the project as agreed. Add another option after it and set its Part (Basement, Main stairs…) to offer new work; two options in one Part are a choice between them.",
      "The customer gets the updated quote with a New work you can add section and chooses on the page (or in store, or you record it for them). It joins their project: the total and the payment schedule are on the whole job, GHL's value follows, and there is no second Won or Notion project.",
      "The email and text ask only for what is due now: the deposit on the whole project less what Notion's Master Payments Log shows they've paid.",
    ],
  },
  {
    date: "2026-10-30",
    kind: "new",
    title: "Photos tab: the job's CompanyCam photos in the app",
    details: [
      "A quote with a CompanyCam project has a Photos tab beside Site sheet. It shows every photo on the project by day, newest first, each with the time it was taken, who took it and its description, like CompanyCam's own timeline.",
      "Tap a photo to see it large and use the arrows (or swipe) to go through them. A marked-up photo shows its markup. The search box finds photos by description, person or tag.",
      "Read-only: taking, describing and tagging photos stays in CompanyCam (Open in CompanyCam, top right).",
    ],
  },
  {
    date: "2026-10-30",
    kind: "changed",
    title: "Stairs options add stair items only, by category",
    details: [
      "On a stairs option, Add work shows Staircase (the builder), then one button per Stair Item category (Steps, Bullnoses, Risers, Landings, Accents, Railing, Tasks), each listing only that category's items, then Typed line and Private. Private there offers stair items or a line you type, never the rate card.",
      "A flooring option no longer offers Stairs. Lines already on an option stay as they are.",
      "A new option counts as flooring until it has stair lines, a Stairs scope or a stairs Part, so set the Scope or Part first for a stairs option.",
    ],
  },
  {
    date: "2026-10-30",
    kind: "changed",
    title: "Put on contract, from any version",
    details: [
      "On an accepted quote, an option that isn't on the contract shows Put on contract when its Part (or flooring or stairs) is one the customer has. It opens the change with that option ready to swap in.",
      "Swap option now offers options of the same Part from every version of the quote, not just the accepted one, each with its version beside it.",
      "A change now works the payment schedule out again on the new total, instead of putting the whole difference on the final payment. The email and text say what they've already paid counts toward it.",
    ],
  },
  {
    date: "2026-10-30",
    kind: "changed",
    title: "One working quote: no more Save as new version",
    details: [
      "Work on the quote and its options, like sheets in the Excel workbook. Sending keeps a copy of exactly what the customer saw.",
      "Editing a quote that was already sent opens its draft if there is one; otherwise Save as the next draft starts it, with every option carried over. Pick whether the next draft is preliminary or measured beside the button.",
      "There is only ever one draft per quote, so there is nothing to branch. All quotes lists the versions newest first; the By origin view and the \"from v4\" labels are gone. A change still shows its number.",
    ],
  },
  {
    date: "2026-10-30",
    kind: "new",
    title: "Parts, and Not offered",
    details: [
      "Each option can have a Part in the editor, beside Scope: Main floor, Upstairs, Basement, Main stairs or Basement stairs. Options in one Part are alternatives, and the customer accepts one option per Part, so upstairs and basement flooring can both be taken. Say exactly what an option covers in its description.",
      "An option with no Part works as before: one flooring and one stairs option.",
      "Not offered, beside Part, keeps an option on the quote but leaves it off what the customer is sent. It starts unticked on the Send card and its tab is dashed. Untick it to offer it again.",
    ],
  },
  {
    date: "2026-10-30",
    kind: "changed",
    title: "Accepted quote, easier to read",
    details: [
      "The Accepted card on a quote page is now in sections: Price (before HST, HST, total), Payments (the deposit highlighted, each payment with when it is due), Project Expectations, Hand-off and Links.",
      "Each link (GHL, Notion, CompanyCam, the customer's page) is on its own line.",
      "The option tabs on an accepted quote mark the option the customer took with a green \"Accepted\" badge (one per kind, when they took flooring and stairs).",
    ],
  },
  {
    date: "2026-10-30",
    kind: "new",
    title: "Swap option on a change",
    details: [
      "A customer who accepted one option and now wants another from the same quote (say the other stairs): open the change and press \"Swap it in\" at the top of the editor.",
      "Pick the option they want. The lines from the one they took are ticked to come out, the new option's lines come in exactly as quoted, and the new total shows against the contract. Save, then send it as the updated quote, for the record; the difference goes on the final payment.",
      "Only options from the accepted version, and only the same kind (stairs for stairs, flooring for flooring).",
    ],
  },
  {
    date: "2026-10-30",
    kind: "changed",
    title: "No Edit on an accepted quote, and Send to customer only on a draft",
    details: [
      "An accepted quote's page no longer offers Edit (under the quote or beside its name): Make a change is the way to change it.",
      "The Send to customer button under the quote shows on a draft only. Once a version is sent, the Send card beside it is where to send it again.",
    ],
  },
  {
    date: "2026-10-30",
    kind: "changed",
    title: "Receipts say \"HST (13%) on materials only\"",
    details: ["The HST row inside a receipt's Materials section now reads \"on materials only\"."],
  },
  {
    date: "2026-10-30",
    kind: "changed",
    title: "Receipts: the Materials section stands out as the part with HST",
    details: ["On a receipt with HST on the materials only, the Materials section has a blue bar and says HST applies, its HST rows sit on a tinted band, and the totals at the bottom no longer repeat the HST line."],
  },
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
