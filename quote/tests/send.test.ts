import { describe, expect, it } from "vitest";
import { addDays, copyRange, copyState, customerCopy, discountLabel, hstRow, hstWord, isRange, longDate, offersPdf, parseCopy, pdfName, prelimNote, priceRange, rangeText, rangeWhy, serializeCopy, torontoToday, type CustomerCopy, type Letterhead } from "../src/lib/send/copy";
import { chooseOptions, chosenWords, customerLinks, emailFromFor, emailMessage, greetingName, isToken, newToken, optionProblem, parseOptionIds, parseResend, resendEmailMessage, resendKind, resendProblems, resendSmsMessage, sendProblems, smsMessage, type SendInput } from "../src/lib/send/plan";
import { encode, textWidth, wrap } from "../src/lib/send/pdfDoc";
import { quotePdf } from "../src/lib/send/pdf";
import { fromQuote } from "../src/lib/editor/model";
import { fingerprint } from "../src/lib/quotes/savePlan";
import { optionTotals } from "../src/lib/calc";
import type { Quote, QuoteLine, QuoteOption } from "../src/lib/quotes/types";

/* Invented numbers and people only (quote/CLAUDE.md rule 4). */

let seq = 0;
const line = (p: Partial<QuoteLine>): QuoteLine => ({
  id: `recLINE${String(++seq).padStart(10, "0")}`,
  lineType: "Install",
  section: "Install",
  include: true,
  qty: 100,
  waste: null,
  unitPrice: null,
  unitPriceSnap: 2,
  unitCostSnap: 1.2,
  costOverride: null,
  manualCost: null,
  minChargeSnap: null,
  hasSource: true,
  sourceKind: "rate",
  sourceId: "recRATE0000000001",
  labourType: "Click install",
  spec: "Standard",
  description: "Click install",
  area: null,
  uom: "sqft",
  contractor: "Crew Alpha",
  clientNote: null,
  sortOrder: seq,
  airtableTotal: null,
  airtableCost: null,
  ...p,
});

/** An option whose Airtable rollups agree with the app, as a healthy quote's do. */
function option(name: string, lines: QuoteLine[], discountRate = 0.1, hst = true, p: Partial<QuoteOption> = {}): QuoteOption {
  const t = optionTotals(lines, discountRate, hst);
  return { id: `recOPT${name.replace(/\W/g, "").padEnd(11, "0").slice(0, 11)}`, name, description: null, sortOrder: 1, recommended: false, serviceLevel: null, crew: null, lines, airtable: { ...t }, ...p };
}

function quote(p: Partial<Quote> = {}): Quote {
  return {
    id: "recVERSION0000001",
    quoteId: "Q-9001 v1",
    version: 1,
    status: "Draft",
    basis: "Measured",
    showHst: true,
    // Itemised by default in these fixtures: the lump-sum tests opt out (lump sum is the app default since 2026-10-22).
    itemised: true,
    discountRate: 0.1,
    validUntil: null,
    sentAt: null,
    sendBlock: null,
    customerToken: null,
    sentBy: null,
    sentTo: null,
    notes: "Internal: customer is price sensitive",
    customerName: "Pat Example",
    siteAddress: "1 Sample Street",
    siteCity: "Testville",
    link: {
      quoteRecordId: "recQUOTE000000001",
      quoteNumber: "Q-9001",
      displayName: "Pat Example - 1026 - Q-9001",
      firstName: "Pat",
      lastName: "Example",
      phone: "+15550000000",
      email: "pat@example.com",
      addressStatus: "Confirmed",
      linkStatus: "Linked",
      projectTiming: null,
      ghlContactId: "contactAbc123",
      ghlOpportunityId: "oppAbc123",
      folderUrl: null,
      companyCamUrl: null,
      projectNumber: null,
      notionProjectUrl: null,
    },
    options: [
      option("Vinyl plank", [
        line({ section: "Removal", lineType: "Removal", description: "Carpet removal", qty: 200, unitPriceSnap: 1, unitCostSnap: 0.6, contractor: "Crew Beta" }),
        line({ description: "Click install", qty: 200, waste: 0.1, unitPriceSnap: 2, area: "Living room" }),
        line({ section: "Delivery", lineType: "Delivery", description: "Delivery", qty: 1, uom: "flat", unitPriceSnap: 50, minChargeSnap: 120, unitCostSnap: 40 }),
        line({ section: "Install", lineType: "Note", description: "Furniture moved by the homeowner", qty: null }),
        line({ section: "Other", lineType: "Other", description: "Stair nosing", qty: 4, uom: "piece", unitPrice: 30, unitPriceSnap: 25, include: false, clientNote: "if wanted" }),
        line({ section: "Exclusions", lineType: "Note", description: "Painting", qty: null }),
      ]),
    ],
    legacyLineCount: 0,
    ...p,
  };
}

const COMPANY: Letterhead = { name: "Titan Flooring", address: "1 Example Road, Testville", phone: "555-000-0000", email: "hello@example.com", website: null };
const AT = { sentOn: "2026-10-15", validUntil: "2026-11-14", company: COMPANY };

describe("customer copy", () => {
  const q = quote();
  const copy = customerCopy(q, AT);
  const o = copy.options[0];

  it("carries the customer's numbers, matching calc.ts to the cent", () => {
    const t = optionTotals(q.options[0].lines, 0.1, true);
    expect(o.totals).toEqual({ preDiscount: t.preDiscount, discount: t.discount, subtotal: t.subtotal, hst: t.hst, total: t.total, payment1: t.payment1, payment2: t.payment2, paymentFinal: t.paymentFinal });
    // 200 + 440 (200 × 1.1 × 2) + 120 (minimum) = 760; −76; 684; HST 88.92; 772.92
    expect(o.totals.total).toBe(772.92);
  });

  it("never carries a cost, a margin, a contractor, a card rate or an internal note", () => {
    const text = serializeCopy(copy);
    for (const leak of ["Crew Alpha", "Crew Beta", "price sensitive", "cost", "Cost", "margin", "profit", "contractor", "Snap", "recLINE", "recRATE", "Standard"]) {
      expect(text).not.toContain(leak);
    }
    // The card rate (25) of the overridden add-on never appears; its charged rate (30) does.
    const addOn = o.sections.flatMap((s) => s.lines).find((l) => l.kind === "item" && l.description === "Stair nosing");
    expect(addOn).toMatchObject({ unitPrice: 30, amount: 120, optional: true, n: null });
  });

  it("shows quantity with waste included, so quantity × price is the amount", () => {
    const install = o.sections.find((s) => s.name === "Install")!.lines.find((l) => l.kind === "item")!;
    expect(install).toMatchObject({ qty: 220, unitPrice: 2, amount: 440, wastePct: 10, note: "Living room" });
  });

  it("says when a minimum charge sets the amount, instead of a price that doesn't multiply out", () => {
    const delivery = o.sections.find((s) => s.name === "Delivery")!.lines[0];
    expect(delivery).toMatchObject({ minimum: true, unitPrice: null, amount: 120 });
  });

  it("numbers included lines only, keeps text rows, and lists exclusions apart", () => {
    const items = o.sections.flatMap((s) => s.lines).filter((l) => l.kind === "item");
    expect(items.map((l) => (l.kind === "item" ? l.n : null))).toEqual([1, 2, 3, null]);
    expect(o.sections.flatMap((s) => s.lines).some((l) => l.kind === "text" && l.text === "Furniture moved by the homeowner")).toBe(true);
    expect(o.exclusions).toEqual(["Painting"]);
    expect(o.sections.map((s) => s.name)).toEqual(["Install", "Removal", "Delivery", "Other"]);
    expect(o.sections.find((s) => s.name === "Other")!.total).toBe(0);
  });

  it("says where a material's HST differs from the quote's (2026-10-16)", () => {
    const floor = (p: Partial<QuoteLine>) => line({ section: "Materials", lineType: "Material", sourceKind: "product", description: "Oak plank", qty: 100, unitPriceSnap: 5, ...p });
    const items = (c: ReturnType<typeof customerCopy>) => c.options[0].sections.flatMap((s) => s.lines).filter((l) => l.kind === "item");
    // Quote charges HST; one material doesn't.
    const on = customerCopy(quote({ options: [option("A", [line({}), floor({ noHst: true })])] }), AT);
    expect(items(on).map((l) => (l.kind === "item" ? l.hst ?? null : null))).toEqual([null, "none"]);
    expect(hstRow(on, on.options[0].totals).label).toBe("HST (13%)");
    // Quote's HST off; the material still charges it.
    const off = customerCopy(quote({ showHst: false, discountRate: 0, options: [option("A", [line({}), floor({})], 0, false)] }), AT);
    expect(items(off).map((l) => (l.kind === "item" ? l.hst ?? null : null))).toEqual([null, "plus"]);
    expect(off.options[0].totals.hst).toBe(65); // 500 × 13%, the labour untaxed
    expect(hstRow(off, off.options[0].totals)).toEqual({ label: "HST (13%) on materials", amount: 65 });
    expect(hstWord(off, off.options[0].totals)).toBe("incl. HST on materials");
    expect(new TextDecoder("latin1").decode(quotePdf(off))).toContain("plus HST");
  });

  it("round-trips through Airtable text, and refuses anything else", () => {
    expect(parseCopy(serializeCopy(copy))).toEqual(copy);
    expect(parseCopy("{")).toBeNull();
    expect(parseCopy(JSON.stringify({ ...copy, v: 2 }))).toBeNull();
    expect(parseCopy(null)).toBeNull();
  });
});

describe("before sending", () => {
  const q = quote();
  const ok: SendInput = { base: fingerprint(fromQuote(q)), validUntil: "2026-11-14", channels: { email: true, sms: true } };
  const ctx = { today: "2026-10-15", fingerprint: fingerprint(fromQuote(q)) };

  it("lets a healthy draft go", () => {
    expect(sendProblems(q, ok, ctx)).toEqual([]);
  });

  it("only ever sends a draft, and only what the person saw", () => {
    expect(sendProblems(quote({ status: "Sent" }), ok, ctx)[0]).toMatch(/This version is Sent/);
    expect(sendProblems(q, { ...ok, base: "changed" }, ctx)).toEqual(["This version changed since the page opened. Reload it and check it before sending."]);
  });

  it("honours Airtable's own block on a preliminary once a measured version exists", () => {
    const block = "Blocked: a measured version exists for this quote. Send that one, or mark this version measured.";
    expect(sendProblems(quote({ sendBlock: block }), ok, ctx)).toContain(block);
  });

  it("refuses an empty option, a parity disagreement, and old-format lines", () => {
    const empty = option("Empty", [line({ lineType: "Note", description: "tbc" })]);
    expect(sendProblems(quote({ options: [...q.options, empty] }), ok, { ...ctx, fingerprint: fingerprint(fromQuote(quote({ options: [...q.options, empty] }))) })).toContain("Empty has nothing priced in it.");
    const off = { ...q.options[0], airtable: { ...q.options[0].airtable, total: 1 } };
    const bad = quote({ options: [off] });
    expect(sendProblems(bad, ok, ctx)).toContain("The app and Airtable disagree on Vinyl plank. Fix that before sending.");
    expect(sendProblems(quote({ legacyLineCount: 2 }), ok, ctx)[0]).toMatch(/old A\/B\/C format/);
  });

  it("needs a contact, a valid date in the next year, and a channel GHL can reach", () => {
    const noEmail = quote({ link: { ...q.link!, email: null } });
    expect(sendProblems(noEmail, ok, ctx)).toEqual(["GHL has no email for this customer."]);
    expect(sendProblems(noEmail, { ...ok, channels: { email: false, sms: true } }, ctx)).toEqual([]);
    expect(sendProblems(quote({ link: { ...q.link!, ghlContactId: null } }), ok, ctx)[0]).toMatch(/no GHL contact/);
    expect(sendProblems(q, { ...ok, channels: { email: false, sms: false } }, ctx)).toEqual(["Choose email, text, or both."]);
    expect(sendProblems(q, { ...ok, validUntil: "2026-10-14" }, ctx)).toEqual(["The valid-until date is in the past."]);
    expect(sendProblems(q, { ...ok, validUntil: "2027-12-01" }, ctx)).toEqual(["The valid-until date is more than a year away."]);
    expect(sendProblems(q, { ...ok, validUntil: "next month" }, ctx)).toEqual(["Choose the date the quote is good until."]);
  });
});

describe("the messages", () => {
  const copy = customerCopy(quote(), AT);
  const to = { contactId: "contactAbc123", firstName: "Pat", ...customerLinks("https://view.example.com/", "A".repeat(32), pdfName(copy)) };

  it("emails the link through the customer's GHL contact, never with the PDF attached (2026-10-27)", () => {
    const m = emailMessage(copy, to);
    expect(m).toMatchObject({ type: "Email", contactId: "contactAbc123", subject: "Your flooring quote Q-9001 from Titan Flooring" });
    // The PDF is never attached. Not offered (the default): the email says nothing about one.
    expect(copy.pdf).toBe(false);
    expect("attachments" in m).toBe(false);
    expect(m.type === "Email" && m.html).not.toMatch(/PDF/);
    // Offered: the quote page has it, and the email says so; still no attachment.
    const offered = emailMessage(customerCopy(quote(), { ...AT, pdf: true }), to);
    expect("attachments" in offered).toBe(false);
    expect(offered.type === "Email" && offered.html).toContain("You can download a PDF from the quote page.");
    if (m.type !== "Email") throw new Error();
    expect(m.html).toContain(`href="https://view.example.com/c/${"A".repeat(32)}"`);
    expect(m.html).toContain("Hi Pat,");
    expect(m.html).toContain("$772.92");
    expect(m.html).toContain("November 14, 2026");
  });

  it("says what is included, the way the old mobile-quote messages did, and the timing (2026-10-18; card rows since 2026-10-22)", () => {
    const q = quote({ basis: "Preliminary", link: { ...quote().link!, projectTiming: "Within 1 month" } });
    q.options[0].lines.push(line({ section: "Stairs", lineType: "Stairs", sourceKind: "manual", sourceId: null, hasSource: false, description: "Townhome – Vinyl treads", uom: "flat", qty: 1, unitPrice: 1500, unitPriceSnap: null, unitCostSnap: null, contractor: null }));
    q.options[0].description = "* Townhome – Vinyl treads We'll install waterproof vinyl treads. The handrails will be sanded and refinished to match, and up to 50 spindles are included.";
    q.options[0].airtable = { ...optionTotals(q.options[0].lines, 0.1, true) };
    const c = customerCopy(q, AT);
    expect(c.timing).toBe("Within 1 month");
    expect(c.options[0].sections.map((s) => s.name)).toContain("Stairs");
    const m = emailMessage(c, to);
    if (m.type !== "Email") throw new Error();
    expect(m.subject).toBe("Your flooring and stairs estimate Q-9001 from Titan Flooring");
    expect(m.html).toContain("What&rsquo;s included");
    expect(m.html).toContain("Removal &middot; Carpet removal</td>");
    expect(m.html).toContain(">200 sq ft</td>");
    expect(m.html).toContain("Install &middot; Click install</td>");
    // A line that already opens with the work is not prefixed, and a quantity gets its thousands separator.
    const big = customerCopy(quote({ options: [option("One", [line({ section: "Removal", lineType: "Removal", description: "Remove old carpet", qty: 1500, unitPrice: 1, unitPriceSnap: null, unitCostSnap: null, contractor: null, sourceKind: "manual", sourceId: null, hasSource: false })])] }), AT);
    const bm = emailMessage(big, to);
    expect(bm.type === "Email" && bm.html).toContain(">Remove old carpet</td>");
    expect(bm.type === "Email" && bm.html).toContain(">1,500 sq ft</td>");
    // A Rate Card name carries its own section, so it is never prefixed (2026-10-24): no "Install · Refinish | SAND".
    const rc = customerCopy(quote({ options: [option("One", [line({ section: "Install", description: "Refinish | SAND - Hardwood (Oak)", qty: 1333, unitPrice: 1, unitPriceSnap: null, unitCostSnap: null, contractor: null, sourceKind: "manual", sourceId: null, hasSource: false })])] }), AT);
    const rm = emailMessage(rc, to);
    expect(rm.type === "Email" && rm.html).toContain(">Refinish | SAND - Hardwood (Oak)</td>");
    expect(rm.type === "Email" && rm.html).not.toContain("Install &middot; Refinish");
    expect(m.html).toContain("Stairs &middot; Townhome – Vinyl treads</td>");
    expect(m.html).toContain("Townhome – Vinyl treads We&#39;ll install waterproof vinyl treads. The handrails will be sanded and refinished to match, and up to 50 spindles are included.</td>");
    expect(m.html).toContain(">Timing</td>");
    expect(m.html).toContain(">Within 1 month</td>");
    // A preliminary goes as a range since 2026-10-27.
    expect(m.html).toContain("Estimated range");
    const t = smsMessage(c, to);
    expect(t.type === "SMS" ? t.message : "").toMatch(/Your flooring and stairs estimate is \$[\d,]+ to \$[\d,]+ \+ HST\./);
    // The link sits alone on its line, after the label, with a blank line before the reply line; no phone number (2026-10-24).
    expect(t.type === "SMS" ? t.message : "").toMatch(/\n\nSee the full details here:\nhttps:\/\/\S+\n\n/);
    expect(t.type === "SMS" ? t.message : "").not.toMatch(/call|555-000-0000/);
  });

  it("is sent from the signed-in quoter on the company's domain, and from GHL's default otherwise (2026-10-22)", () => {
    const albert = { email: "Albert@Example.com", firstName: "Albert" };
    expect(emailFromFor(albert, "hello@example.com", true)).toBe("Albert @ Titan Flooring <albert@example.com>");
    expect(emailFromFor(albert, "hello@example.com", false)).toBe("albert@example.com");
    expect(emailFromFor({ email: "info@example.com", firstName: null }, "hello@example.com", true)).toBe("info@example.com");
    // A quoter signed in on another domain: GHL can only send from a verified one, so the location default is used.
    expect(emailFromFor({ email: "albert@gmail.example", firstName: "Albert" }, "hello@example.com", true)).toBeNull();
    // No letterhead email configured: nothing to check the domain against, so the quoter's address is used.
    expect(emailFromFor(albert, null, false)).toBe("albert@example.com");
    expect(emailFromFor(null, "hello@example.com", true)).toBeNull();
    const m = emailMessage(copy, to, albert);
    expect(m.type === "Email" && m.emailFrom).toBe("Albert @ Titan Flooring <albert@example.com>");
    expect(m.type === "Email" && m.html).toContain("Albert &middot; Titan Flooring");
    expect(m.type === "Email" && m.html).toContain("Ask for Albert.");
    const plain = emailMessage(copy, to);
    expect(plain.type === "Email" && "emailFrom" in plain).toBe(false);
    expect(plain.type === "Email" && plain.html).toContain("The Titan Flooring team");
    // The send can force a particular From (the bare address, or none) on a retry.
    expect(emailMessage(copy, to, albert, { emailFrom: null }).type === "Email" && "emailFrom" in emailMessage(copy, to, albert, { emailFrom: null })).toBe(false);
  });

  it("is a framed, email-safe document: tables, inline styles, the logo when there is one, the letterhead in the footer", () => {
    const m = emailMessage(copy, to);
    if (m.type !== "Email") throw new Error();
    expect(m.html.startsWith("<!doctype html>")).toBe(true);
    expect(m.html).not.toContain("<img"); // no logo configured: the name is set as a wordmark
    expect(m.html).toContain(">Titan Flooring</p>");
    expect(m.html).toContain("1 Example Road, Testville");
    // No HST number anywhere (Albert, 2026-10-27: an estimate, not a formal invoice).
    expect(m.html).not.toContain("HST #");
    expect(m.html).not.toMatch(/<link|<script|unsubscribe/i);
    const withLogo = emailMessage(customerCopy(quote(), { ...AT, company: { ...COMPANY, logoUrl: "https://cdn.example.com/logo.png" } }), to);
    expect(withLogo.type === "Email" && withLogo.html.match(/<img /g)?.length).toBe(1);
    expect(withLogo.type === "Email" && withLogo.html).toContain('src="https://cdn.example.com/logo.png"');
    // Two options: each is a card with its name, the recommended one marked, and the button says compare.
    const two = customerCopy(quote({ options: [quote().options[0], option("Engineered oak", quote().options[0].lines, 0.1, true, { recommended: true })] }), AT);
    const mm = emailMessage(two, to);
    expect(mm.type === "Email" && mm.html).toContain(">Recommended</span>");
    expect(mm.type === "Email" && mm.html).toContain("View and compare your quote");
    expect(mm.type === "Email" && mm.html).toContain("2 ways to do the work");
  });

  it("leads every amount before HST, with the HST and the with-HST total under it (2026-10-24)", () => {
    const m = emailMessage(copy, to);
    if (m.type !== "Email") throw new Error();
    // The big number is the price before HST, tagged "+ HST"; the two quiet lines carry the tax and the total.
    expect(m.html).toMatch(/class="total"[^>]*><span[^>]*>\$684\.00<\/span><span[^>]*> \+ HST<\/span>/);
    expect(m.html.match(/\+ HST/g)?.length).toBe(2); // beside the number, and in the preheader; never twice on the card
    expect(m.html).toContain(">HST (13%)</td>");
    expect(m.html).toContain(">$88.92</td>");
    expect(m.html).toContain(">With HST</td>");
    expect(m.html).toContain(">$772.92</td>");
    expect(m.html).toContain("Total $684.00 + HST");
    expect(m.html).not.toContain("incl. HST");
    // No HST charged at all: "before HST", and no tax lines.
    const off = customerCopy(quote({ showHst: false, options: [option("Vinyl plank", quote().options[0].lines, 0.1, false)] }), AT);
    const om = emailMessage(off, to);
    expect(om.type === "Email" && om.html).toContain("before HST");
    expect(om.type === "Email" && om.html).not.toMatch(/With HST|\+ HST/);
    const ot = smsMessage(off, to);
    expect(ot.type === "SMS" && ot.message).toMatch(/\$[\d,.]+ before HST, good until/);
    // Two options: the text quotes the lower price before HST.
    const pricier = option("Oak", quote().options[0].lines.map((l) => ({ ...l, unitPrice: (l.unitPrice ?? 0) * 2, unitPriceSnap: l.unitPriceSnap === null ? null : l.unitPriceSnap * 2 })));
    pricier.airtable = optionTotals(pricier.lines, 0.1, true);
    const two = smsMessage(customerCopy(quote({ options: [pricier, quote().options[0]] }), AT), to);
    expect(two.type === "SMS" && two.message).toContain("from $684 + HST");
  });

  it("always opens a preliminary generically: a preliminary is before any visit (2026-10-27)", () => {
    const c = customerCopy(quote({ basis: "Preliminary" }), AT);
    const m = emailMessage(c, to);
    // Since 2026-10-27 a preliminary is a range: "a price range" where it said "a rough number".
    expect(m.type === "Email" && m.html).toContain("Thanks for telling us about your project. Here is a price range based on what you&rsquo;ve described.");
    expect(m.type === "Email" && m.html).not.toContain("having us over");
    // A measured quote says neither.
    const measured = emailMessage(copy, to);
    expect(measured.type === "Email" && measured.html).not.toMatch(/having us over|telling us about/);
  });

  it("offers both bookings on a preliminary, each on its own step (2026-10-23; the extra button gone 2026-10-27)", () => {
    const c = customerCopy(quote({ basis: "Preliminary" }), AT);
    const booking = { inStore: "https://book.example/store", inHome: "https://book.example/home" };
    const m = emailMessage(c, to, null, { booking });
    if (m.type !== "Email") throw new Error();
    expect(m.html).toContain('href="https://book.example/store"');
    expect(m.html).toContain("Book a showroom visit");
    expect(m.html).toContain('href="https://book.example/home"');
    expect(m.html).toContain("Book a measurement");
    expect(m.html).not.toContain("Book an in-store visit");
    expect(m.html.match(/book\.example\/store/g)?.length).toBe(1); // the step link only
    // A measured quote has no bookings in it; without the links a preliminary simply shows none.
    const measured = emailMessage(copy, to, null, { booking });
    expect(measured.type === "Email" && measured.html).not.toContain("book.example");
    const bare = emailMessage(c, to);
    expect(bare.type === "Email" && bare.html).not.toContain("Book a");
  });

  it("escapes what staff typed", () => {
    const evil = '<img src=x onerror="alert(1)">';
    const two = customerCopy(quote({ options: [option(evil, quote().options[0].lines), option("Plain", quote().options[0].lines)] }), AT);
    const m = emailMessage(two, { ...to, firstName: "<b>Pat</b>" });
    if (m.type !== "Email") throw new Error();
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(m.html).not.toContain("<b>Pat</b>");
    const bad = emailMessage(copy, { ...to, link: 'https://x.example/" onclick="alert(1)' });
    expect(bad.type === "Email" && bad.html).toContain("href=\"https://x.example/&quot; onclick=&quot;alert(1)\"");
  });

  it("texts who is writing, the one number, the link on its own line, and says preliminary when it is (2026-10-22)", () => {
    const me = { email: "albert@example.com", firstName: "Albert" };
    const m = smsMessage(customerCopy(quote({ basis: "Preliminary" }), AT), to, me);
    expect(m).toEqual({
      type: "SMS",
      contactId: "contactAbc123",
      // A preliminary carries no good-until date (2026-10-22), and always opens generically (2026-10-27).
      // Since 2026-10-27, as a range: $684 less 3% is $663.48, down to $660; plus 10% is $752.40, up to $760.
      message: `Hi Pat, it's Albert from Titan Flooring. Thanks for telling us about your project. Your flooring estimate is $660 to $760 + HST.\n\nSee the full details here:\nhttps://view.example.com/c/${"A".repeat(32)}\n\nThe final price should land in that range. Any questions, just reply.`,
    });
    const measured = smsMessage(customerCopy(quote(), AT), to, me);
    expect(measured.type === "SMS" && measured.message).toBe(
      `Hi Pat, it's Albert from Titan Flooring. Your flooring quote is ready, $684 + HST, good until Nov 14.\n\nSee the full details here:\nhttps://view.example.com/c/${"A".repeat(32)}\n\nReply here if anything needs changing.`,
    );
    const two = customerCopy(quote({ options: [quote().options[0], option("Oak", quote().options[0].lines)] }), AT);
    const pair = smsMessage(two, to, me);
    expect(pair.type === "SMS" && pair.message).toContain("2 options for your flooring are ready to compare, from $684 + HST, good until Nov 14.\n\nSee the full details here:\n");
    // No curly quotes or emoji anywhere: one would switch the text to UCS-2 and halve each segment.
    for (const t of [m, measured]) expect(t.type === "SMS" && /^[\x20-\x7e\n]*$/.test(t.message)).toBe(true);
  });

  it("greets by first name only when there is a real one, and signs with the company when the sender has none", () => {
    expect(greetingName("Pat")).toBe("Pat");
    expect(greetingName(" Mary Ann ")).toBe("Mary");
    expect(greetingName("Zoë")).toBe("Zoë");
    expect(greetingName("")).toBeNull();
    expect(greetingName("123")).toBeNull();
    const anon = smsMessage(copy, { ...to, firstName: null });
    expect(anon.type === "SMS" ? anon.message : "").toMatch(/^Hi, it's Titan Flooring\. Your flooring quote is ready/);
    const shared = smsMessage(copy, to, { email: "info@example.com", firstName: null });
    expect(shared.type === "SMS" ? shared.message : "").toMatch(/^Hi Pat, it's Titan Flooring\./);
  });
});

describe("the link", () => {
  it("makes long random tokens, and recognises only those", () => {
    const a = newToken();
    expect(isToken(a)).toBe(true);
    expect(a).not.toBe(newToken());
    expect(isToken("short")).toBe(false);
    expect(isToken(`${"a".repeat(31)}'`)).toBe(false);
    // Every byte that is kept maps evenly onto the alphabet.
    expect(newToken(() => new Uint8Array(48).fill(0))).toBe("A".repeat(32));
  });

  it("shows a version only once it was really sent, and says what changed since", () => {
    expect(copyState("Draft", "2026-11-14", "2026-10-15")).toBe("hidden");
    expect(copyState(null, null, "2026-10-15")).toBe("hidden");
    expect(copyState("Sent", "2026-11-14", "2026-11-14")).toBe("open");
    expect(copyState("Sent", "2026-11-14", "2026-11-15")).toBe("expired");
    expect(copyState("Expired", "2026-11-14", "2026-10-20")).toBe("closed");
    expect(copyState("Lost", null, "2026-10-20")).toBe("closed");
    expect(copyState("Won", "2026-11-14", "2027-01-01")).toBe("accepted");
    expect(copyState("Superseded", "2026-11-14", "2026-10-20")).toBe("replaced");
  });

  it("names the PDF after the quote", () => {
    expect(pdfName({ quoteNumber: "Q-9001", version: 2 })).toBe("Titan-Flooring-Quote-Q-9001-v2.pdf");
    expect(pdfName({ quoteNumber: "Q/9 001", version: null })).toBe("Titan-Flooring-Quote-Q-9-001.pdf");
  });
});

describe("dates", () => {
  it("uses Toronto's day, not the server's", () => {
    expect(torontoToday(new Date("2026-10-16T03:30:00Z"))).toBe("2026-10-15");
    expect(addDays("2026-10-15", 30)).toBe("2026-11-14");
    expect(addDays("2026-12-15", 30)).toBe("2027-01-14");
    expect(longDate("2026-11-14")).toBe("November 14, 2026");
  });
});

describe("the PDF", () => {
  it("is a well-formed PDF whose cross-reference table points at every object", () => {
    const bytes = quotePdf(customerCopy(quote(), AT));
    const text = Buffer.from(bytes).toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(text.match(/startxref\n(\d+)\n/)![1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    for (const s of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = s.index! + s[0].length;
      expect(text.slice(start + Number(s[1]), start + Number(s[1]) + 10)).toBe("\nendstream");
    }
  });

  it("prints the customer's figures and none of the internal ones", () => {
    const text = Buffer.from(quotePdf(customerCopy(quote(), AT))).toString("latin1");
    // Leads before HST (2026-10-24): the bar is the subtotal "+ HST"; the tax and the total with it follow.
    for (const s of ["(Subtotal before HST)", "($684.00)", "(HST \\(13%\\))", "($88.92)", "(Total with HST)", "($772.92)", "(PAYMENT SCHEDULE, WITH HST)", "(PREPARED FOR)", "(Pat Example)", "(Optional \\267 $120.00)", "(Living room \\267 includes 10% waste allowance)", "(minimum charge)"]) expect(text).toContain(s);
    expect(text).not.toContain("HST #");
    // A copy frozen before 2026-10-27 still carries the number; it is never drawn.
    const old = { ...customerCopy(quote(), AT), company: { ...COMPANY, hstNumber: "123456789 RT0001" } } as CustomerCopy;
    expect(Buffer.from(quotePdf(old)).toString("latin1")).not.toContain("123456789");
    const mail = emailMessage(old, { contactId: "c", firstName: "Sam", link: "https://quote.example/c/x" });
    expect(mail.type === "Email" && mail.html.includes("123456789")).toBe(false);
    for (const s of ["Crew Alpha", "price sensitive", "$1.20", "Margin"]) expect(text).not.toContain(s);
  });

  it("turns the page for a long option and numbers every page", () => {
    const many = Array.from({ length: 60 }, (_, i) => line({ description: `Room ${i + 1} install with a long description that wraps onto a second line in the table`, qty: 10 + i }));
    const text = Buffer.from(quotePdf(customerCopy(quote({ options: [option("Big job", many)] }), AT))).toString("latin1");
    const pages = Number(text.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)![1]);
    expect(pages).toBeGreaterThan(2);
    expect(text).toContain(`(Q-9001  \\267  Page ${pages} of ${pages})`);
    expect(text).toContain("(Item \\(continued\\))");
  });
});

describe("PDF text", () => {
  it("encodes accents, dashes and quotes, and prints the rest as ?", () => {
    expect(encode("é – ’ • ✓")).toEqual([0xe9, 32, 0x96, 32, 0x92, 32, 0x95, 32, 63]);
  });

  it("measures with the standard metrics and wraps within the width", () => {
    expect(textWidth("Hello", "R", 10)).toBeCloseTo(22.78, 2);
    expect(textWidth("Hello", "B", 10)).toBeCloseTo(24.45, 2);
    const lines = wrap("one two three four five six seven eight nine ten", "R", 10, 60);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(textWidth(l, "R", 10)).toBeLessThanOrEqual(60);
    expect(wrap("Supercalifragilisticexpialidocious", "R", 10, 40).every((l) => textWidth(l, "R", 10) <= 40)).toBe(true);
  });
});

describe("the Private section (2026-10-22)", () => {
  // INVENTED numbers. Two private lines: one priced (a rep's fee the customer is billed for but not shown), one cost only.
  const priv = (p: Partial<QuoteLine>) => line({ section: "Private", lineType: "Other", sourceKind: "manual", contractor: null, unitPriceSnap: null, unitCostSnap: null, ...p });
  const lines = [line({}), priv({ description: "Rep referral fee", qty: 1, uom: "flat", unitPrice: 500, costOverride: 300 }), priv({ description: "Contingency, cost only", qty: 1, uom: "flat", unitPrice: 0, costOverride: 150 })];

  it("rolls the priced private lines into one row in Other, named by the option, with no quantity or unit price", () => {
    const c = customerCopy(quote({ discountRate: 0, options: [option("A", lines, 0, true, { privateLabel: "Site preparation and sundries" })] }), AT);
    const o = c.options[0];
    expect(o.sections.map((s) => s.name)).toEqual(["Install", "Other"]);
    const other = o.sections.find((s) => s.name === "Other")!;
    expect(other.lines).toEqual([{ kind: "item", n: 2, description: "Site preparation and sundries", note: null, qty: null, uom: null, wastePct: null, unitPrice: null, minimum: false, amount: 500, optional: false }]);
    expect(other.total).toBe(500);
    // The lines still add up to the subtotal: 200 + 500, no discount.
    expect(o.sections.reduce((a, s) => a + (s.total ?? 0), 0)).toBe(o.totals.subtotal);
    expect(o.totals.subtotal).toBe(700);
  });

  it("defaults the row's name, and never lets a private line's own words or cost reach the customer", () => {
    const c = customerCopy(quote({ options: [option("A", lines, 0, true)] }), AT);
    const text = serializeCopy(c);
    expect(text).toContain("Additional work");
    for (const leak of ["Rep referral fee", "Contingency", "300", "150", "Private"]) expect(text).not.toContain(leak);
    expect(new TextDecoder("latin1").decode(quotePdf(c))).not.toContain("Rep referral");
  });

  it("shows nothing at all when the private lines carry cost only, and counts an excluded one for nothing", () => {
    const costOnly = customerCopy(quote({ options: [option("A", [line({}), priv({ description: "Contingency", qty: 1, uom: "flat", unitPrice: 0, costOverride: 150 })], 0, true)] }), AT);
    expect(costOnly.options[0].sections.map((s) => s.name)).toEqual(["Install"]);
    const excluded = customerCopy(quote({ options: [option("A", [line({}), priv({ description: "Maybe", qty: 1, uom: "flat", unitPrice: 500, include: false })], 0, true)] }), AT);
    expect(excluded.options[0].sections.map((s) => s.name)).toEqual(["Install"]);
  });
});

describe("discount reason (2026-10-22)", () => {
  it("prints beside the Discount row on the page and the PDF when one was given, and is absent otherwise", () => {
    const withReason = customerCopy(quote({ discountReason: "  Fall promotion " }), AT);
    expect(withReason.discountReason).toBe("Fall promotion");
    expect(discountLabel(withReason)).toBe("Discount (10%) · Fall promotion");
    expect(new TextDecoder("latin1").decode(quotePdf(withReason))).toContain("Fall promotion");
    const without = customerCopy(quote(), AT);
    expect("discountReason" in without).toBe(false);
    expect(discountLabel(without)).toBe("Discount (10%)");
    expect(parseCopy(serializeCopy(withReason))).toEqual(withReason);
  });
});

describe("lump sum (2026-10-22)", () => {
  it("keeps what the work includes and drops every price but the add-ons' and the totals", () => {
    const c = customerCopy(quote({ itemised: false }), AT);
    expect(c.pricing).toBe("lump");
    const o = c.options[0];
    const items = o.sections.flatMap((s) => s.lines).filter((l): l is Extract<typeof l, { kind: "item" }> => l.kind === "item");
    for (const l of items.filter((x) => !x.optional)) expect([l.unitPrice, l.amount, l.minimum]).toEqual([null, null, false]);
    expect(items.find((x) => x.optional)).toMatchObject({ unitPrice: 30, amount: 120 });
    // Quantities stay on Install, Removal, Prep and Materials lines only; everything else is words.
    const qtyBySection = o.sections.map((s) => [s.name, s.lines.filter((l) => l.kind === "item" && !l.optional).map((l) => (l.kind === "item" ? l.qty : null))]);
    expect(qtyBySection).toEqual([
      ["Install", [220]],
      ["Removal", [200]],
      ["Delivery", [null]],
      ["Other", []],
    ]);
    expect(o.sections.every((s) => s.total === null)).toBe(true);
    expect(o.totals).toEqual(customerCopy(quote(), AT).options[0].totals);
    const pdf = new TextDecoder("latin1").decode(quotePdf(c));
    expect(pdf).not.toContain("Unit price");
    expect(pdf).not.toContain("Discount");
    expect(pdf).toContain("(Price before HST)"); // leads before HST, like the email (2026-10-24)
    expect(pdf).toContain("(Total with HST)");
    expect(pdf).toContain("one sum for the project");
    expect(parseCopy(serializeCopy(c))).toEqual(c);
    expect(customerCopy(quote(), AT).pricing).toBe("itemised");
  });

  it("shows no row for the Private section: its amount is already inside the one price", () => {
    const priv = line({ section: "Private", lineType: "Other", sourceKind: "manual", description: "Rep fee", qty: 1, uom: "flat", unitPrice: 500, unitPriceSnap: null, unitCostSnap: null });
    const lump = customerCopy(quote({ itemised: false, options: [option("A", [line({}), priv], 0, true)] }), AT);
    expect(lump.options[0].sections.map((s) => s.name)).toEqual(["Install"]);
    expect(serializeCopy(lump)).not.toContain("Additional work");
    expect(lump.options[0].totals.preDiscount).toBe(700); // 200 + the 500 private line, inside the price
    const itemised = customerCopy(quote({ itemised: true, options: [option("A", [line({}), priv], 0, true)] }), AT);
    expect(itemised.options[0].sections.map((s) => s.name)).toEqual(["Install", "Other"]);
    // Nothing said = the default = lump sum.
    expect(customerCopy({ ...quote(), itemised: undefined }, AT).pricing).toBe("lump");
  });

  it("keeps stairs one price on a breakdown: only the flooring is itemised (Albert, 2026-10-28)", () => {
    const step = line({ section: "Stairs", lineType: "Stairs", sourceKind: "stair", description: "Step", qty: 12, uom: "piece", unitPriceSnap: 100 });
    const c = customerCopy(quote({ itemised: true, options: [option("A", [line({}), step], 0, true)] }), AT);
    const [install, stairs] = c.options[0].sections;
    expect(install.total).not.toBeNull();
    expect(install.lines[0]).toMatchObject({ kind: "item", amount: expect.any(Number) });
    expect(stairs).toMatchObject({ name: "Stairs", total: null });
    expect(stairs.lines[0]).toMatchObject({ kind: "item", description: "Step", qty: null, unitPrice: null, amount: null });
  });
});

describe("a preliminary goes as a range (Albert, 2026-10-27)", () => {
  const to = { contactId: "contactAbc123", firstName: "Pat", link: "https://view.example.com/c/x", pdfUrl: "https://view.example.com/c/x/q.pdf" };
  const prelim = () => quote({ basis: "Preliminary" });
  const pdfText = (c: ReturnType<typeof customerCopy>) => new TextDecoder("latin1").decode(quotePdf(c));

  it("runs from 3% under the price to 10% over it, the top at most $3,000 over, rounded outward", () => {
    // $10 steps under $1,000, $50 under $10,000, $100 above.
    expect(priceRange(684)).toEqual({ low: 660, high: 760 });
    expect(priceRange(2000)).toEqual({ low: 1900, high: 2200 });
    expect(priceRange(4930)).toEqual({ low: 4750, high: 5450 });
    expect(priceRange(6000)).toEqual({ low: 5800, high: 6600 });
    expect(priceRange(12345)).toEqual({ low: 11900, high: 13600 });
    expect(priceRange(15000)).toEqual({ low: 14500, high: 16500 });
    // The cap starts at $30,000, where 10% is $3,000.
    expect(priceRange(30000)).toEqual({ low: 29100, high: 33000 });
    expect(priceRange(60000)).toEqual({ low: 58200, high: 63000 });
    // A round price stays round: 1,000 × 1.1 is 1,100, not a float a hair over it rounded up a step.
    expect(priceRange(1000)).toEqual({ low: 950, high: 1100 });
    expect(priceRange(0)).toEqual({ low: 0, high: 0 });
    for (const n of [99.99, 684, 999, 1234.56, 9999, 25000, 31000, 250000]) {
      const r = priceRange(n);
      expect(r.low).toBeLessThan(n);
      expect(r.low).toBeLessThanOrEqual(Math.round(n * 97) / 100);
      expect(r.high).toBeGreaterThanOrEqual(Math.round((n + Math.min(n * 0.1, 3000)) * 100) / 100);
    }
    expect(rangeText(4400, 5450)).toBe("$4,400 – $5,450");
    expect(rangeText(610, 760, " to ")).toBe("$610 to $760");
  });

  it("puts the HST on the range itself, so the two ranges agree even where the cap applies", () => {
    // $60,000 + 13%: the range with HST is $58,200 × 1.13 to $63,000 × 1.13, rounded outward.
    expect(copyRange({ subtotal: 60000, total: 67800 })).toEqual({ low: 58200, high: 63000, lowWithHst: 65700, highWithHst: 71200 });
    // No HST at all: the same range twice.
    expect(copyRange({ subtotal: 6000, total: 6000 })).toEqual({ low: 5800, high: 6600, lowWithHst: 5800, highWithHst: 6600 });
  });

  it("freezes the range on a preliminary's copy, before HST and with it, and keeps the exact totals underneath", () => {
    const c = customerCopy(prelim(), AT);
    // $684 before HST, $772.92 with it (the fixture's numbers).
    expect(c.options[0].range).toEqual({ low: 660, high: 760, lowWithHst: 740, highWithHst: 860 });
    expect(c.options[0].totals.subtotal).toBe(684);
    expect(isRange(c)).toBe(true);
    expect(parseCopy(serializeCopy(c))?.options[0].range).toEqual(c.options[0].range);
    // A measured quote is never a range.
    const m = customerCopy(quote(), AT);
    expect(m.options[0].range).toBeUndefined();
    expect(isRange(m)).toBe(false);
  });

  it("emails the range and no exact figure: not the price, the HST or the total", () => {
    const m = emailMessage(customerCopy(prelim(), AT), to);
    if (m.type !== "Email") throw new Error();
    expect(m.html).toContain("Estimated range");
    expect(m.html).toContain("$660 &ndash;</span> <span style=\"white-space:nowrap;\">$760</span>");
    expect(m.html).toContain(">With HST</td>");
    expect(m.html).toContain("$740 – $860");
    expect(m.html).toContain("Estimated range $660 – $760 + HST"); // the preheader
    for (const exact of ["$684", "$88.92", "$772.92", "Rough total"]) expect(m.html).not.toContain(exact);
    // What the range means, in Albert's words; it never promises the price may come down.
    expect(m.html).toContain("Your final price can be expected to fall within the range below.");
    expect(m.html).toContain("decides where in it you land.");
    expect(m.html).not.toContain("bring it down");
  });

  it("lists several options' ranges, and says from where the lowest starts", () => {
    const lines = quote().options[0].lines;
    const three = customerCopy(quote({ basis: "Preliminary", options: [option("A", lines), option("B", lines), option("C", lines)] }), AT);
    const m = emailMessage(three, to);
    if (m.type !== "Email") throw new Error();
    expect(m.html).toContain("$660 &ndash; $760");
    expect(m.html).toContain("Estimated ranges. What each option includes");
    expect(m.html).toContain("3 options from $660 + HST");
  });

  it("texts the range in GSM-7, with \"to\" instead of a dash", () => {
    const t = smsMessage(customerCopy(prelim(), AT), to);
    if (t.type !== "SMS") throw new Error();
    expect(t.message).toContain("Your flooring estimate is $660 to $760 + HST.");
    expect(t.message).not.toContain("$684");
    expect(/^[\x20-\x7e\n]*$/.test(t.message)).toBe(true);
    // Still two segments (2026-10-24) with a full-length link and a longer name than the fixture's.
    const long = smsMessage(customerCopy(prelim(), AT), { ...to, firstName: "Jordan", link: `https://quote.titanfloors.example/c/${"A".repeat(32)}` }, { email: "albert@example.com", firstName: "Albert" });
    expect(long.type === "SMS" && long.message.length).toBeLessThanOrEqual(306);
  });

  it("draws the range in the PDF, with the payment schedule in shares and no discount rows", () => {
    // The fixtures are itemised with a 10% discount: a measured PDF shows the discount, a preliminary's does not.
    const pdf = pdfText(customerCopy(prelim(), AT));
    expect(pdf).toContain("Estimated range before HST");
    expect(pdf).toContain("On the final price");
    expect(pdf).toContain("PAYMENT SCHEDULE, ON THE FINAL PRICE");
    expect(pdf).toContain("The balance");
    expect(pdf).toContain("can be expected to fall"); // the note wraps, so only its opening is on one line
    expect(pdf).not.toContain("Subtotal before discount");
    expect(pdf).not.toContain("772.92");
    expect(pdfText(customerCopy(quote(), AT))).toContain("Subtotal before discount");
  });

  it("names stair things on a stairs-only preliminary", () => {
    const stairs = option("Stairs", [line({ section: "Stairs", lineType: "Stairs", sourceKind: "manual", sourceId: null, hasSource: false, description: "Main stairs – Sand & stain", uom: "flat", qty: 1, unitPrice: 2000, unitPriceSnap: null, unitCostSnap: null, contractor: null })]);
    const c = customerCopy(quote({ basis: "Preliminary", options: [stairs] }), AT);
    expect(rangeWhy(c)).toContain("the exact step count and the condition of the stairs");
    expect(rangeWhy(customerCopy(prelim(), AT))).toContain("the exact square footage and the condition of the subfloor");
  });

  it("is always a lump sum, even when the breakdown is asked for (2026-10-27)", () => {
    // The fixture asks for the breakdown (itemised: true); a preliminary ignores it, a measured quote keeps it.
    const c = customerCopy(prelim(), AT);
    expect(c.pricing).toBe("lump");
    const items = c.options[0].sections.flatMap((s) => s.lines).filter((l) => l.kind === "item" && !l.optional);
    expect(items.length).toBeGreaterThan(0);
    for (const l of items) expect(l).toMatchObject({ unitPrice: null, amount: null });
    expect(c.options[0].sections.every((s) => s.total === null)).toBe(true);
    expect(customerCopy(quote(), AT).pricing).toBe("itemised");
  });

  it("goes as the exact price when the sender picks it, and as the range when nothing is said (2026-10-27)", () => {
    const exact = customerCopy(prelim(), { ...AT, range: false });
    expect(exact.options[0].range).toBeUndefined();
    expect(isRange(exact)).toBe(false);
    expect(exact.pricing).toBe("lump"); // still a lump sum
    const m = emailMessage(exact, to);
    expect(m.type === "Email" && m.html).toContain("Rough total");
    expect(m.type === "Email" && m.html).toContain("$684.00");
    expect(m.type === "Email" && m.html).toContain("Here is a rough number based on what you&rsquo;ve described.");
    const t = smsMessage(exact, to);
    expect(t.type === "SMS" && t.message).toContain("Your rough flooring estimate is $684 + HST.");
    expect(prelimNote(exact)).not.toContain("range");
    // The default, and an explicit true, are the range.
    expect(customerCopy(prelim(), AT).options[0].range).toBeDefined();
    expect(customerCopy(prelim(), { ...AT, range: true }).options[0].range).toBeDefined();
    // A measured quote never has one, whatever is passed.
    expect(customerCopy(quote(), { ...AT, range: true }).options[0].range).toBeUndefined();
  });

  it("leaves a preliminary frozen before the range as it was sent: one rough number", () => {
    const c = customerCopy(prelim(), AT);
    const old = { ...c, options: c.options.map((o) => ({ ...o, range: undefined })) };
    expect(isRange(old)).toBe(false);
    expect(prelimNote(old)).toBe("This is a preliminary estimate, based on what we know so far. We confirm the final price once we have measured the space.");
    const m = emailMessage(old, to);
    expect(m.type === "Email" && m.html).toContain("Rough total");
    expect(m.type === "Email" && m.html).toContain("$684.00");
    const t = smsMessage(old, to);
    expect(t.type === "SMS" && t.message).toContain("Your rough flooring estimate is $684 + HST.");
    expect(pdfText(old)).not.toContain("Estimated range");
  });
});

describe("a preliminary has no good-until date (2026-10-22)", () => {
  const prelim = quote({ basis: "Preliminary" });
  const NO_DATE = { ...AT, validUntil: null };

  it("sends without a date and ignores one; a measured quote still needs one", () => {
    const ctx = { today: "2026-10-15", fingerprint: fingerprint(fromQuote(prelim)) };
    expect(sendProblems(prelim, { base: ctx.fingerprint, validUntil: null, channels: { email: true, sms: false } }, ctx)).toEqual([]);
    expect(sendProblems(prelim, { base: ctx.fingerprint, validUntil: "2020-01-01", channels: { email: true, sms: false } }, ctx)).toEqual([]);
    const measured = quote();
    const mctx = { today: "2026-10-15", fingerprint: fingerprint(fromQuote(measured)) };
    expect(sendProblems(measured, { base: mctx.fingerprint, validUntil: null, channels: { email: true, sms: false } }, mctx)).toEqual(["Choose the date the quote is good until."]);
  });

  it("carries no date in the copy, the PDF, the email or the text, and its link never expires", () => {
    const c = customerCopy(prelim, AT);
    expect(c.validUntil).toBeNull();
    expect(customerCopy(prelim, NO_DATE).validUntil).toBeNull();
    expect(new TextDecoder("latin1").decode(quotePdf(c))).not.toContain("Valid until");
    const mail = emailMessage(c, { contactId: "c1", firstName: "Jane", link: "https://example.test/c/x" });
    expect(mail.type === "Email" && mail.html).not.toContain("good until");
    expect(mail.type === "Email" && mail.html).toContain("Preliminary estimate");
    expect(mail.type === "Email" && mail.html).toContain("The link doesn&rsquo;t expire.");
    const text = smsMessage(c, { contactId: "c1", firstName: "Jane", link: "https://example.test/c/x" });
    expect(text.type === "SMS" && text.message).not.toContain("good until");
    expect(text.type === "SMS" && text.message).toContain("estimate");
    expect(copyState("Sent", null, "2030-01-01")).toBe("open");
    // A measured quote keeps its date.
    expect(customerCopy(quote(), AT).validUntil).toBe("2026-11-14");
  });
});

describe("choosing which options go to the customer (2026-10-24)", () => {
  // Option ids in the fixtures are names; real ones are record ids, which is what parseOptionIds accepts.
  const A = "recOptionAAAAAAAA", B = "recOptionBBBBBBBB", C = "recOptionCCCCCCCC";
  const to = { contactId: "contactAbc123", firstName: "Pat", link: "https://view.example.com/c/x", pdfUrl: "https://view.example.com/c/x/q.pdf" };
  const lines = quote().options[0].lines;
  const three = () => {
    const opts = [option("Vinyl plank", lines), option("Oak", lines, 0.1, true, { recommended: true }), option("Draft idea", [line({ lineType: "Note", description: "tbc" })])];
    opts[0].id = A; opts[1].id = B; opts[2].id = C;
    return quote({ options: opts });
  };

  it("reads a list of record ids, and anything else as all", () => {
    expect(parseOptionIds([A, "nope", A, C])).toEqual([A, C]);
    expect(parseOptionIds(`${A},${B}`)).toEqual([A, B]);
    expect(parseOptionIds(undefined)).toBeNull();
    expect(parseOptionIds("")).toEqual([]);
  });

  it("keeps the chosen options in the editor's order, and says which went", () => {
    const q = three();
    expect(chooseOptions(q, [C, A]).options.map((o) => o.id)).toEqual([A, C]);
    expect(chooseOptions(q, null).options).toHaveLength(3);
    expect(chosenWords(q, [A, B])).toBe("options 1 and 2");
    expect(chosenWords(q, [B])).toBe("option 2 only");
    expect(chosenWords(q, [A, B, C])).toBeNull();
    expect(chosenWords(q, null)).toBeNull();
  });

  it("checks only what goes: an unticked half-built option no longer blocks the send", () => {
    const q = three();
    const ctx = { today: "2026-10-15", fingerprint: fingerprint(fromQuote(q)) };
    const input: SendInput = { base: ctx.fingerprint, validUntil: "2026-11-14", channels: { email: true, sms: false } };
    expect(sendProblems(q, input, ctx)).toEqual(["Draft idea has nothing priced in it."]);
    expect(sendProblems(q, { ...input, optionIds: [A, B] }, ctx)).toEqual([]);
    expect(sendProblems(q, { ...input, optionIds: [] }, ctx)).toEqual(["Choose at least one option to send."]);
    expect(sendProblems(q, { ...input, optionIds: [A, "recGoneGoneGoneGo"] }, ctx)).toContain("An option you chose is no longer on this version. Reload the page.");
    // The Send card applies the per-option checks itself, to whatever is ticked.
    expect(sendProblems(q, input, { ...ctx, skipOptions: true })).toEqual([]);
    expect(optionProblem(q, q.options[2])).toBe("Draft idea has nothing priced in it.");
    expect(optionProblem(q, q.options[0])).toBeNull();
  });

  it("draws everything the customer gets from the chosen options only", () => {
    const c = customerCopy(chooseOptions(three(), [B]), AT);
    expect(c.options.map((o) => o.name)).toEqual(["Oak"]);
    const m = emailMessage(c, to);
    expect(m.type === "Email" && m.html).not.toMatch(/Vinyl plank|Draft idea/);
    const t = smsMessage(c, to);
    expect(t.type === "SMS" && t.message).toContain("Your flooring quote is ready");
  });

  it("lists three or more options compactly in the email: names and prices, the detail on the page", () => {
    const q = three();
    q.options[2] = { ...option("Engineered hardwood", lines), id: C };
    const m = emailMessage(customerCopy(q, AT), to);
    if (m.type !== "Email") throw new Error();
    expect(m.html).toContain("Your 3 options");
    expect(m.html).toContain("Option 3</span><br>Engineered hardwood");
    expect(m.html).toContain(">Recommended</span>");
    expect(m.html).toContain("What each option includes, the HST and the payment schedule are on the quote page.");
    expect(m.html).not.toContain("What&rsquo;s included");
    expect(m.html).not.toContain(">With HST</td>");
    // Two options still get a full card each.
    const two = emailMessage(customerCopy(chooseOptions(q, [A, B]), AT), to);
    expect(two.type === "Email" && two.html).not.toContain("Your 2 options");
    expect(two.type === "Email" && two.html.match(/>With HST<\/td>/g)?.length).toBe(2);
  });
});

describe("the PDF is offered on the quote page only when ticked (Albert, 2026-10-27)", () => {
  it("freezes the choice on the copy: off by default, on when ticked, and a copy from before keeps its PDF", () => {
    const off = customerCopy(quote(), AT);
    const on = customerCopy(quote(), { ...AT, pdf: true });
    expect(offersPdf(off)).toBe(false);
    expect(offersPdf(on)).toBe(true);
    expect(parseCopy(serializeCopy(off))?.pdf).toBe(false);
    const before = JSON.parse(serializeCopy(on));
    delete before.pdf;
    expect(offersPdf(parseCopy(JSON.stringify(before))!)).toBe(true);
  });
});

describe("send again (2026-10-30)", () => {
  const copy = customerCopy(quote(), AT);
  const to = { contactId: "c1", firstName: "Sam", link: "https://q.example/c/" + "a".repeat(32), pdfUrl: null as string | null };
  const sender = { email: "pat@example.com", firstName: "Pat" };
  const today = "2026-10-30";
  const both = { channels: { email: true, sms: true }, pdf: true };
  const contact = { email: "sam@example.com", phone: "+15555550100" };

  it("reads what the browser sends, and nothing else", () => {
    expect(parseResend({ channels: { email: true }, pdf: true })).toEqual({ channels: { email: true, sms: false }, pdf: true });
    expect(parseResend({ channels: { sms: "yes" } })).toEqual({ channels: { email: false, sms: false }, pdf: false });
    expect(parseResend(null)).toBeNull();
  });

  it("only a version still out with the customer goes again, by a channel the contact has", () => {
    expect(resendProblems({ status: "Sent", validUntil: "2026-11-30" }, both, contact, today)).toEqual([]);
    expect(resendProblems({ status: "Sent", validUntil: null }, both, contact, today)).toEqual([]);
    expect(resendProblems({ status: "Draft", validUntil: null }, both, contact, today)[0]).toMatch(/Sent|out with/);
    // Accepted and won quotes go again too (2026-10-30), whatever their good-until date.
    expect(resendProblems({ status: "Accepted", validUntil: "2026-10-01" }, both, contact, today)).toEqual([]);
    expect(resendProblems({ status: "Won", validUntil: null }, both, contact, today)).toEqual([]);
    expect(resendProblems({ status: "Lost", validUntil: null }, both, contact, today)).toHaveLength(1);
    expect(resendProblems({ status: "Superseded", validUntil: null }, both, contact, today)).toHaveLength(1);
    expect(resendProblems({ status: "Sent", validUntil: "2026-10-29" }, both, contact, today)[0]).toMatch(/good-until/);
    expect(resendProblems({ status: "Sent", validUntil: null }, { channels: { email: false, sms: false }, pdf: false }, contact, today)[0]).toMatch(/Choose/);
    expect(resendProblems({ status: "Sent", validUntil: null }, both, { email: null, phone: null }, today)).toHaveLength(2);
  });

  it("with the PDF: its link and the quote's, never an attachment", () => {
    const pdfUrl = `${to.link}/${pdfName(copy)}`;
    const e = resendEmailMessage(copy, { ...to, pdfUrl }, sender);
    expect(e.type).toBe("Email");
    if (e.type !== "Email") return;
    expect(e.subject).toMatch(/as a PDF/);
    expect(e.html).toContain(pdfUrl);
    expect(e.html).toContain(to.link);
    expect(e.attachments).toBeUndefined();
    const t = resendSmsMessage(copy, { ...to, pdfUrl }, sender);
    expect(t.type === "SMS" && t.message).toContain(`PDF:\n${pdfUrl}\n`);
    expect(t.type === "SMS" && t.message).toMatch(/^Hi Sam, it's Pat from /);
  });

  it("without the PDF: the quote's link again, and no PDF anywhere", () => {
    const e = resendEmailMessage(copy, to, sender);
    expect(e.type === "Email" && e.html).not.toMatch(/\.pdf/);
    expect(e.type === "Email" && e.html).toContain("here&rsquo;s your quote again.");
    const t = resendSmsMessage(copy, to, sender);
    expect(t.type === "SMS" && t.message).toMatch(/Here's your quote .* again:\n/);
    expect(t.type === "SMS" && /^[\x20-\x7E\n]*$/.test(t.message)).toBe(true);
  });

  // 2026-10-31: accepted and changed quotes say what they are, in one short line.
  it("an accepted quote and a change each say so", () => {
    const e = resendEmailMessage(copy, { ...to, pdfUrl: `${to.link}/x-accepted.pdf`, kind: "accepted" }, sender);
    expect(e.type === "Email" && e.subject).toMatch(/accepted quote .* as a PDF/);
    expect(e.type === "Email" && e.html).toContain("here&rsquo;s your accepted quote again, with the PDF.");
    const t = resendSmsMessage(copy, { ...to, pdfUrl: null, kind: "accepted" }, sender);
    expect(t.type === "SMS" && t.message).toMatch(/Here's your accepted quote .* again:\n/);
    const c = resendSmsMessage(copy, { ...to, pdfUrl: null, kind: "change" }, sender);
    expect(c.type === "SMS" && c.message).toMatch(/Here's your updated quote .* again:\n/);
    expect(c.type === "SMS" && /^[\x20-\x7E\n]*$/.test(c.message)).toBe(true);
  });

  it("works out what is being sent again", () => {
    expect(resendKind("Sent", {})).toBe("quote");
    expect(resendKind("Sent", { change: {} })).toBe("change");
    expect(resendKind("Accepted", {})).toBe("accepted");
    expect(resendKind("Won", { change: {} })).toBe("accepted");
  });
});
