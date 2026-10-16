import { describe, expect, it } from "vitest";
import { addDays, copyState, customerCopy, longDate, parseCopy, pdfName, serializeCopy, torontoToday, type Letterhead } from "../src/lib/send/copy";
import { customerLinks, emailMessage, greetingName, isToken, newToken, sendProblems, smsMessage, type SendInput } from "../src/lib/send/plan";
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
  return { id: `recOPT${name.replace(/\W/g, "").padEnd(11, "0").slice(0, 11)}`, name, description: null, sortOrder: 1, recommended: false, serviceLevel: null, lines, airtable: { ...t }, ...p };
}

function quote(p: Partial<Quote> = {}): Quote {
  return {
    id: "recVERSION0000001",
    quoteId: "Q-9001 v1",
    version: 1,
    status: "Draft",
    basis: "Measured",
    showHst: true,
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

const COMPANY: Letterhead = { name: "Titan Flooring", address: "1 Example Road, Testville", phone: "555-000-0000", email: "hello@example.com", website: null, hstNumber: "123456789 RT0001" };
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

  it("emails the link and attaches the PDF, through the customer's GHL contact", () => {
    const m = emailMessage(copy, to);
    expect(m).toMatchObject({ type: "Email", contactId: "contactAbc123", subject: "Your Titan Flooring quote Q-9001", attachments: [`https://view.example.com/c/${"A".repeat(32)}/Titan-Flooring-Quote-Q-9001-v1.pdf`] });
    if (m.type !== "Email") throw new Error();
    expect(m.html).toContain(`href="https://view.example.com/c/${"A".repeat(32)}"`);
    expect(m.html).toContain("Hi Pat,");
    expect(m.html).toContain("$772.92");
    expect(m.html).toContain("November 14, 2026");
  });

  it("escapes what staff typed", () => {
    const sneaky = customerCopy(quote({ options: [option('<img src=x onerror="alert(1)">', quote().options[0].lines)] }), AT);
    const m = emailMessage(sneaky, to);
    if (m.type !== "Email") throw new Error();
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;img");
  });

  it("texts the link, and says preliminary when it is", () => {
    const m = smsMessage(customerCopy(quote({ basis: "Preliminary" }), AT), to);
    expect(m).toEqual({
      type: "SMS",
      contactId: "contactAbc123",
      message: `Hi Pat, your Titan Flooring preliminary quote Q-9001 is ready: https://view.example.com/c/${"A".repeat(32)}\nIt's good until November 14, 2026. Any questions, just reply here.`,
    });
  });

  it("greets by first name only when there is a real one", () => {
    expect(greetingName("Pat")).toBe("Pat");
    expect(greetingName(" Mary Ann ")).toBe("Mary");
    expect(greetingName("Zoë")).toBe("Zoë");
    expect(greetingName("")).toBeNull();
    expect(greetingName("123")).toBeNull();
    expect(smsMessage(copy, { ...to, firstName: null }).type === "SMS" && (smsMessage(copy, { ...to, firstName: null }) as { message: string }).message.startsWith("Your Titan")).toBe(true);
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
    for (const s of ["(Total)", "($772.92)", "(PREPARED FOR)", "(Pat Example)", "(Optional \\267 $120.00)", "(Living room \\267 includes 10% waste allowance)", "(minimum charge)", "(HST # 123456789 RT0001)"]) expect(text).toContain(s);
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
