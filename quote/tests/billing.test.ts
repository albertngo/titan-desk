import { describe, expect, it } from "vitest";
import { billingFile, billingKind, billingLogWhat, billingPlan, billingTotals, BILLING_FILE, cleanPayments, contractCopy, isBillingNumber, parseSnapshot, serializeSnapshot, shownTotals, unvoidLogWhat, voidLogWhat, type BillingSnapshot } from "../src/lib/billing/doc";
import { billingPdf } from "../src/lib/billing/pdf";
import { optionTotals } from "../src/lib/calc";
import { notionPageId, paymentOf } from "../src/lib/notion/rows";
import type { Quote, QuoteLine, QuoteOption } from "../src/lib/quotes/types";
import { customerCopy, type Letterhead } from "../src/lib/send/copy";
import { billingEmailMessage } from "../src/lib/send/plan";


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


/* Invoices and receipts (Albert, 2026-10-30). Invented numbers and people only. */

const material = (p: Partial<QuoteLine> = {}) => line({ section: "Materials", lineType: "Material", description: "Oak plank", qty: 100, unitPriceSnap: 5, unitCostSnap: 3, contractor: null, sourceKind: "manual", sourceId: null, hasSource: false, ...p });

describe("invoice or receipt", () => {
  it("is an invoice only when HST is on every line", () => {
    expect(billingKind(customerCopy(quote(), AT))).toBe("invoice");
    // HST on, but one material marked No HST: a receipt.
    const partial = quote({ options: [option("A", [line({}), material({ noHst: true })])] });
    expect(billingKind(customerCopy(partial, AT))).toBe("receipt");
    // HST only on the floor material (the quote's switch off): a receipt.
    const materialsOnly = quote({ showHst: false, options: [option("A", [line({}), material({})], 0.1, false)] });
    expect(billingKind(customerCopy(materialsOnly, AT))).toBe("receipt");
    // No HST at all: a receipt.
    expect(billingKind(customerCopy(quote({ showHst: false, options: [option("A", [line({})], 0.1, false)] }), AT))).toBe("receipt");
  });

  it("numbers look like Airtable's formulas make them, and only those", () => {
    expect(isBillingNumber("invoice", "INV-82571")).toBe(true);
    expect(isBillingNumber("receipt", "R-10245")).toBe(true);
    expect(isBillingNumber("invoice", "R-10245")).toBe(false);
    expect(isBillingNumber("receipt", "R-")).toBe(false);
    expect(billingFile("invoice", "INV-82571")).toBe("Invoice-INV-82571.pdf");
    expect(BILLING_FILE.test("Receipt-R-10245.pdf")).toBe(true);
    expect(BILLING_FILE.test("Receipt-R-10245.pdf.exe")).toBe(false);
  });

  it("drops the change box and keeps one option", () => {
    const two = customerCopy(quote({ options: [option("A", [line({})]), option("B", [line({ qty: 50 })])] }), AT);
    const c = contractCopy({ ...two, change: { no: 1 } as never });
    expect(c.change).toBeUndefined();
    expect(c.options).toHaveLength(1);
    // The fixture's optional "Stair nosing" wasn't taken, so it isn't billed.
    expect(JSON.stringify(c)).not.toContain("Stair nosing");
  });

  it("adds the payments up; an overpayment is a credit, never a negative balance", () => {
    const copy = customerCopy(quote(), AT);
    const total = copy.options[0].totals.total;
    const pay = (amount: number, date: string | null = "2026-10-01") => ({ date, amount, method: "e-Transfer", reference: null });
    expect(billingTotals({ copy, payments: [pay(100), pay(50.5)] })).toEqual({ total, paid: 150.5, balance: Math.round((total - 150.5) * 100) / 100, credit: 0 });
    const over = billingTotals({ copy, payments: [pay(total + 10)] });
    expect(over.balance).toBe(0);
    expect(over.credit).toBe(10);
    // Zero and negative amounts are left for a person; undated ones go last.
    expect(cleanPayments([pay(0), pay(-5), pay(20, null), pay(10, "2026-09-01")]).map((p) => p.amount)).toEqual([10, 20]);
  });

  it("reads a Notion payment row: date, amount, form of payment, reference; nothing else", () => {
    const p = paymentOf({ properties: { "Received Date": { date: { start: "2026-10-03T10:00:00.000-04:00" } }, Amount: { number: 1234.5 }, "Form of Payment": { select: { name: "e-Transfer" } }, "Reference Number": { rich_text: [{ plain_text: "CA123" }] }, "Sender's Name": { rich_text: [{ plain_text: "Someone" }] } } });
    expect(p).toEqual({ date: "2026-10-03", amount: 1234.5, method: "e-Transfer", reference: "CA123" });
    expect(notionPageId("https://www.notion.so/Some-Project-0123456789abcdef0123456789abcdef")).toBe("01234567-89ab-cdef-0123-456789abcdef");
    expect(notionPageId("https://app.notion.com/p/0123456789abcdef0123456789abcdef?pvs=4")).toBe("01234567-89ab-cdef-0123-456789abcdef");
    expect(notionPageId(null)).toBeNull();
  });

  const snap = (p: Partial<BillingSnapshot> = {}): BillingSnapshot => ({
    v: 1,
    kind: "invoice",
    number: "INV-82571",
    issuedOn: "2026-10-30",
    asOf: "2026-10-30",
    copy: contractCopy(customerCopy(quote(), AT)),
    payments: [{ date: "2026-10-01", amount: 100, method: "e-Transfer", reference: "REF1" }],
    hstNumber: "123456789RT0001",
    project: "PP-900",
    ...p,
  });

  it("the snapshot round-trips, and anything else reads as none", () => {
    expect(parseSnapshot(serializeSnapshot(snap()))).toEqual(snap());
    expect(parseSnapshot(serializeSnapshot(snap({ number: "R-10245" })))).toBeNull();
    expect(parseSnapshot("{}")).toBeNull();
    expect(parseSnapshot("not json")).toBeNull();
  });

  it("draws a PDF titled and numbered as the document", () => {
    const bytes = billingPdf(snap());
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).toContain("INVOICE");
    expect(text).toContain("INV-82571");
    expect(text).toContain("123456789RT0001");
    expect(text).toContain("PAYMENTS RECEIVED");
    expect(new TextDecoder("latin1").decode(billingPdf(snap({ kind: "receipt", number: "R-10245", hstNumber: null })))).toContain("RECEIPT");
  });

  it("the email attaches the PDF and states what is left", () => {
    const s = snap();
    const t = billingTotals(s);
    const m = billingEmailMessage(s.copy, { title: "Invoice", number: s.number, ...t }, { contactId: "c1", firstName: "Pat", pdfUrl: "https://q.example/c/x/Invoice-INV-82571.pdf" }, { email: "sam@example.com", firstName: "Sam" });
    expect(m.type).toBe("Email");
    if (m.type !== "Email") return;
    expect(m.attachments).toEqual(["https://q.example/c/x/Invoice-INV-82571.pdf"]);
    expect(m.subject).toBe("Your invoice INV-82571 from Titan Flooring (Q-9001)");
    expect(m.html).toContain("Balance owing");
  });
  /* 2026-10-31 (Albert): the HST flips after a number was issued; an overpayment may read as Paid in full. */

  it("invoice and receipt switch back and forth; only an emailed one is voided, the rest stay in the background", () => {
    const inv = { kind: "invoice" as const, id: "recINV", voided: false, emailed: true };
    // Invoice emailed, then a change makes the contract a receipt: a receipt number is issued, the invoice is voided.
    expect(billingPlan("receipt", [inv])).toEqual({ live: null, replaces: [inv], toVoid: [inv] });
    // Never emailed: it stays on file, untouched, and the receipt doesn't mention it.
    const quiet = { ...inv, emailed: false };
    expect(billingPlan("receipt", [quiet])).toEqual({ live: null, replaces: [], toVoid: [] });
    // Already void: the receipt still names it, nothing more to void.
    const rec = { kind: "receipt" as const, id: "recREC", voided: false, emailed: false };
    const voidInv = { ...inv, voided: true };
    expect(billingPlan("receipt", [voidInv, rec])).toEqual({ live: rec, replaces: [voidInv], toVoid: [] });
    // Back to an invoice: the same invoice number comes back; the receipt, never emailed, stays in the background.
    expect(billingPlan("invoice", [voidInv, rec])).toEqual({ live: voidInv, replaces: [], toVoid: [] });
    // ...and had the receipt been emailed, it is the one voided now.
    const sentRec = { ...rec, emailed: true };
    expect(billingPlan("invoice", [voidInv, sentRec])).toEqual({ live: voidInv, replaces: [sentRec], toVoid: [sentRec] });
  });

  it("a voided document says so; its replacement names it", () => {
    const old = snap({ voided: { on: "2026-10-31", by: "sam@example.com", replacedBy: "R-10250" } });
    const fresh = snap({ kind: "receipt", number: "R-10250", replaces: ["INV-82571"] });
    expect(parseSnapshot(serializeSnapshot(old))?.voided?.replacedBy).toBe("R-10250");
    const voidText = new TextDecoder("latin1").decode(billingPdf(old));
    expect(voidText).toContain("VOID");
    expect(voidText).toContain("R-10250");
    expect(new TextDecoder("latin1").decode(billingPdf(snap()))).not.toContain("VOID");
    const freshText = new TextDecoder("latin1").decode(billingPdf(fresh));
    expect(freshText).toContain("Replaces");
    expect(freshText).toMatch(/INV-82571 \\?\(void\\?\)/);
    expect(voidLogWhat("invoice", "INV-82571", "R-10250")).toBe("invoice INV-82571 void: the contract's HST changed, so it is replaced by receipt R-10250");
    expect(unvoidLogWhat("invoice", "INV-82571")).toBe("invoice INV-82571 current again: the contract's HST changed back");
    expect(billingLogWhat(fresh, "exported", ["INV-82571"])).toBe("receipt R-10250 exported, 1 payment; INV-82571 void, replaced by it");
  });

  it("an overpayment shows as a credit only when chosen; otherwise Paid in full, no amounts", () => {
    const base = snap();
    const total = base.copy.options[0].totals.total;
    const over = [{ date: "2026-10-01", amount: total + 25, method: "e-Transfer", reference: "REF9" }];
    // Exported before 2026-10-31 (no choice stored): shown as it was, a credit.
    expect(shownTotals({ ...base, payments: over })).toEqual({ total, paid: total + 25, balance: 0, credit: 25, itemised: true });
    expect(shownTotals({ ...base, payments: over, creditShown: true }).credit).toBe(25);
    const hidden = shownTotals({ ...base, payments: over, creditShown: false });
    expect(hidden).toEqual({ total, paid: total, balance: 0, credit: 0, itemised: false });
    // Not overpaid: hiding changes nothing.
    expect(shownTotals({ ...base, creditShown: false }).itemised).toBe(true);
    const pdf = new TextDecoder("latin1").decode(billingPdf(snap({ payments: over, creditShown: false })));
    expect(pdf).toContain("Paid in full");
    expect(pdf).not.toContain("REF9");
    expect(pdf).not.toContain("Credit");
    const m = billingEmailMessage(base.copy, { title: "Invoice", number: base.number, ...hidden }, { contactId: "c1", firstName: "Pat", pdfUrl: "https://q.example/c/x/Invoice-INV-82571.pdf" });
    if (m.type !== "Email") throw new Error("not an email");
    expect(m.html).toContain("Paid in full");
    expect(m.html).not.toContain("Paid so far");
    expect(m.html).not.toContain("Credit");
  });
});
