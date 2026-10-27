import { describe, expect, it } from "vitest";
import { acceptedCopy, acceptProblems, addOnsOf, buildAcceptance, notAcceptable, parseAcceptance, parseSignature, readAcceptInput, serializeAcceptance, type AcceptInput } from "../src/lib/accept/plan";
import { termsHref, termsLabel, type Terms } from "../src/lib/accept/terms";
import { optionTotals } from "../src/lib/calc";
import { ACCEPT_FIELDS, SALES_PIPELINE_ID } from "../src/lib/ghl/ids";
import { buildContract, buildLost, buildWon, wonStageId } from "../src/lib/link/ghlRequest";
import { PRESETS } from "../src/lib/pricing/schedule";
import type { Quote, QuoteLine, QuoteOption } from "../src/lib/quotes/types";
import { acceptedPdfName, customerCopy, pdfName, type CustomerCopy, type Letterhead } from "../src/lib/send/copy";
import { quotePdf } from "../src/lib/send/pdf";
import { acceptedEmailMessage, acceptedSmsMessage, depositHow } from "../src/lib/send/plan";

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
  unitPriceSnap: 10,
  unitCostSnap: 5,
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

function option(name: string, lines: QuoteLine[], p: Partial<QuoteOption> = {}): QuoteOption {
  return { id: `recOPT${name.replace(/\W/g, "").padEnd(11, "0").slice(0, 11)}`, name, description: null, sortOrder: 1, recommended: false, serviceLevel: null, crew: null, lines, airtable: { ...optionTotals(lines, 0, true) }, ...p };
}

const addOn = line({ section: "Other", description: "Stair nosing", include: false, qty: 4, unitPriceSnap: 25 }); // 100, taxed
const quote = (p: Partial<Quote> = {}): Quote => ({
  id: "recVERSION0000001",
  quoteId: "Q-9001 v2",
  version: 2,
  status: "Sent",
  basis: "Measured",
  showHst: true,
  itemised: false,
  discountRate: 0,
  validUntil: "2026-11-30",
  sentAt: "2026-10-27",
  sendBlock: null,
  customerToken: "a".repeat(32),
  sentBy: "pat.quoter@example.com",
  sentTo: "Email, Text",
  notes: null,
  customerName: "Sam Sample",
  siteAddress: "1 Sample Street",
  siteCity: "Testville",
  link: {
    quoteRecordId: "recQUOTE000000001",
    quoteNumber: "Q-9001",
    displayName: "Sam Sample - 1026 - Q-9001",
    firstName: "Sam",
    lastName: "Sample",
    phone: "+15550000000",
    email: "sam@example.com",
    addressStatus: "Confirmed",
    linkStatus: "Linked",
    projectTiming: null,
    ghlContactId: "ctc0000001",
    ghlOpportunityId: "opp0000001",
    folderUrl: null,
    companyCamUrl: null,
    projectNumber: null,
    notionProjectUrl: null,
  },
  options: [option("Oak", [line({}), addOn]), option("Vinyl", [line({ unitPriceSnap: 8 })])],
  legacyLineCount: 0,
  ...p,
});
const COMPANY: Letterhead = { name: "Titan Flooring", address: null, phone: null, email: "hello@example.com", website: null, hstNumber: null };
const copyOf = (q = quote()) => customerCopy(q, { sentOn: "2026-10-27", validUntil: "2026-11-30", company: COMPANY });
const TERMS: Terms = { id: "recTermsAAAAAAAAA", on: "2026-10-27" };
const input = (p: Partial<AcceptInput> = {}): AcceptInput => ({ optionIndex: 0, addOns: [], name: "Sam Sample", terms: true, termsId: TERMS.id, signature: null, reason: null, ...p });
const NOW = new Date("2026-11-03T19:14:00Z"); // 2:14 pm in Toronto
const SIG = "M10 10 L200 120 L400 40 M500 200 L800 250";

describe("what may be accepted", () => {
  const copy = copyOf();

  it("a measured quote, still good and out with the customer, with the terms in place", () => {
    expect(notAcceptable(copy, "open", TERMS)).toBeNull();
    expect(acceptProblems(copy, "open", input(), { terms: TERMS, method: "link" })).toEqual([]);
  });

  it("never a preliminary, an expired, replaced, closed or already accepted quote, and nothing while the terms are missing", () => {
    expect(notAcceptable(copyOf(quote({ basis: "Preliminary" })), "open", TERMS)).toMatch(/preliminary estimate can't be accepted/);
    expect(notAcceptable(copy, "expired", TERMS)).toMatch(/past its good-until date/);
    expect(notAcceptable(copy, "replaced", TERMS)).toMatch(/newer version/);
    expect(notAcceptable(copy, "closed", TERMS)).toMatch(/no longer open/);
    expect(notAcceptable(copy, "accepted", TERMS)).toMatch(/already been accepted/);
    expect(notAcceptable(copy, "open", null)).toMatch(/isn't switched on yet/);
  });

  it("needs an option, a name, the terms ticked; a signature in store; a reason from staff; only offered add-ons", () => {
    const p = (i: Partial<AcceptInput>, method: "link" | "store" | "staff" = "link") => acceptProblems(copy, "open", input(i), { terms: TERMS, method }).join(" ");
    expect(p({ optionIndex: 5 })).toMatch(/Choose the option/);
    expect(p({ name: "x" })).toMatch(/full name/);
    expect(p({ name: "12345" })).toMatch(/full name/);
    expect(p({ terms: false })).toMatch(/Project Expectations/);
    expect(p({}, "store")).toMatch(/Sign in the box/);
    expect(p({ signature: SIG }, "store")).toBe("");
    expect(p({}, "staff")).toMatch(/where the written yes is/);
    expect(p({ reason: "Signed paper, scanned to the job folder" }, "staff")).toBe("");
    expect(p({ addOns: ["9.9"] })).toMatch(/isn't on that option/);
    expect(p({ optionIndex: 1, addOns: addOnsOf(copy, copy.options[0]).map((a) => a.key) })).toMatch(/isn't on that option/);
  });

  it("reads only what it expects from the request", () => {
    expect(readAcceptInput(null)).toBeNull();
    expect(readAcceptInput({ optionIndex: "0" })).toBeNull();
    expect(readAcceptInput({ optionIndex: 1, addOns: ["0.1", "0.1", "bad", 3], name: "  Sam   Sample ", terms: true, signature: " ", total: 1, extra: "x" })).toEqual({
      optionIndex: 1,
      addOns: ["0.1"],
      name: "Sam Sample",
      terms: true,
      termsId: null,
      signature: null,
      reason: null,
    });
    expect(readAcceptInput({ optionIndex: 0, termsId: "recTermsAAAAAAAAA" })?.termsId).toBe("recTermsAAAAAAAAA");
    expect(readAcceptInput({ optionIndex: 0, termsId: "'; DROP" })?.termsId).toBeNull();
  });

  it("refuses an Accept made against Project Expectations that have been replaced since the page opened", () => {
    const copy = copyOf();
    const p = (termsId: string | null) => acceptProblems(copy, "open", input({ termsId }), { terms: TERMS, method: "link" }).join(" ");
    expect(p(TERMS.id)).toBe("");
    expect(p("recOlderAAAAAAAAA")).toMatch(/just updated\. Reload the page/);
    expect(p(null)).toMatch(/just updated/);
  });
});

describe("the Project Expectations' label", () => {
  it("names the version by the day the doc was saved", () => {
    expect(termsLabel("2026-10-27")).toBe("updated October 27, 2026");
    expect(termsLabel("nonsense")).toBe("current version");
    expect(termsHref("abc")).toBe("/c/abc/Titan-Flooring-Project-Expectations.pdf");
  });
});

describe("the acceptance record", () => {
  const copy = copyOf();
  const keys = addOnsOf(copy, copy.options[0]);

  it("offers each add-on with its shown price and whether it carries HST", () => {
    expect(keys).toEqual([{ key: expect.stringMatching(/^\d+\.\d+$/), description: "Stair nosing", amount: 100, taxed: true }]);
  });

  it("the accepted total is the option plus the ticked add-ons at their shown price, with HST; the deposit follows", () => {
    const a = buildAcceptance(copy, input({ addOns: [keys[0].key] }), { now: NOW, terms: TERMS, method: "link", recordedBy: null, userAgent: "Test" });
    // 1,000 + 100 = 1,100; HST 143; 1,243. 35% = 435.05, 35% = 435.05, balance 372.90.
    expect(a.totals).toEqual({ subtotal: 1100, hst: 143, total: 1243 });
    expect(a.stages.map((s) => s.amount)).toEqual([435.05, 435.05, 372.9]);
    expect(a).toMatchObject({ on: "2026-11-03", method: "link", name: "Sam Sample", terms: "2026-10-27", termsId: TERMS.id, option: { index: 0, name: "Oak", ref: copy.options[0].ref }, addOns: [{ description: "Stair nosing", amount: 100 }], recordedBy: null, reason: null, signature: null });
  });

  it("with nothing ticked the accepted figures are the sent figures exactly", () => {
    const a = buildAcceptance(copy, input(), { now: NOW, terms: TERMS, method: "link", recordedBy: null, userAgent: null });
    const t = copy.options[0].totals;
    expect(a.totals).toEqual({ subtotal: t.subtotal, hst: t.hst, total: t.total });
    expect(a.stages.map((s) => s.amount)).toEqual([t.payment1, t.payment2, t.paymentFinal]);
  });

  it("follows the quote's own schedule, and keeps a material deposit's dollars when add-ons are ticked", () => {
    const floor = line({ section: "Materials", lineType: "Material", sourceKind: "product", description: "Oak plank", unitPriceSnap: 4 }); // 400 + HST
    const q = quote({ showHst: false, schedule: PRESETS.materials.schedule(), options: [option("Oak", [line({}), floor, addOn], { airtable: { ...optionTotals([line({}), floor, addOn], 0, false) } })] });
    const c = copyOf(q);
    expect(c.paymentSchedule?.preset).toBe("materials");
    const deposit = c.options[0].schedule![0].amount;
    expect(deposit).toBe(452); // the material, 400, with its HST
    const a = buildAcceptance(c, input({ addOns: addOnsOf(c, c.options[0]).map((x) => x.key) }), { now: NOW, terms: TERMS, method: "link", recordedBy: null, userAgent: null });
    expect(a.stages[0].amount).toBe(452);
    expect(a.stages.reduce((s, x) => s + (x.amount ?? 0), 0)).toBeCloseTo(a.totals.total, 2);
  });

  it("records who and why for staff, and a signature only when one can be read", () => {
    const staff = buildAcceptance(copy, input({ reason: "Signed paper in store" }), { now: NOW, terms: TERMS, method: "staff", recordedBy: "pat.quoter@example.com", userAgent: null });
    expect(staff).toMatchObject({ method: "staff", recordedBy: "pat.quoter@example.com", reason: "Signed paper in store" });
    const store = buildAcceptance(copy, input({ signature: SIG }), { now: NOW, terms: TERMS, method: "store", recordedBy: null, userAgent: null });
    expect(store.signature).toBe(SIG);
    expect(parseAcceptance(serializeAcceptance(store))).toEqual(store);
    expect(parseAcceptance("{}")).toBeNull();
  });

  it("reads a drawn signature only inside its box, M and L commands only", () => {
    expect(parseSignature(SIG)).toEqual([
      [
        [10, 10],
        [200, 120],
        [400, 40],
      ],
      [
        [500, 200],
        [800, 250],
      ],
    ]);
    expect(parseSignature("M10 10 L2000 10")).toBeNull();
    expect(parseSignature("M10 10 C1 2 3 4")).toBeNull();
    expect(parseSignature("<script>")).toBeNull();
    expect(parseSignature("M10 10")).toBeNull();
  });
});

describe("the accepted copy, page and PDF", () => {
  const copy = copyOf();
  const key = addOnsOf(copy, copy.options[0])[0].key;
  const a = buildAcceptance(copy, input({ addOns: [key], signature: SIG }), { now: NOW, terms: TERMS, method: "store", recordedBy: null, userAgent: null });
  const accepted = acceptedCopy(copy, a);

  it("keeps only the accepted option, with the ticked add-on now part of the work and the accepted totals", () => {
    expect(accepted.options.map((o) => o.name)).toEqual(["Oak"]);
    const items = accepted.options[0].sections.flatMap((s) => s.lines).filter((l) => l.kind === "item");
    expect(items.find((l) => l.kind === "item" && l.description === "Stair nosing")).toMatchObject({ optional: false, added: true, amount: 100 });
    expect(accepted.options[0].totals).toMatchObject({ subtotal: 1100, hst: 143, total: 1243, payment1: 435.05 });
    expect(accepted.options[0].schedule).toEqual(a.stages);
  });

  it("drops an add-on that wasn't ticked", () => {
    const plain = acceptedCopy(copy, buildAcceptance(copy, input(), { now: NOW, terms: TERMS, method: "link", recordedBy: null, userAgent: null }));
    expect(JSON.stringify(plain)).not.toContain("Stair nosing");
  });

  it("the stamped PDF says who accepted, when, how, the terms version, and draws the signature", () => {
    const pdf = new TextDecoder("latin1").decode(quotePdf(accepted, { acceptance: a, when: "Tuesday, November 3, 2026 at 2:14 pm" }));
    expect(pdf).toContain("ACCEPTED");
    expect(pdf).toContain("Accepted by Sam Sample on Tuesday, November 3, 2026 at 2:14 pm.");
    expect(pdf).toContain("In our store, signed below.");
    expect(pdf).toContain("Project Expectations, updated October 27, 2026");
    expect(pdf).toMatch(/1 J 1 j [\d. ]+ m [\d. ]+ l/);
    expect(acceptedPdfName(copy)).toBe(pdfName(copy).replace(".pdf", "-accepted.pdf"));
  });
});

describe("the acceptance email and text", () => {
  const copy = copyOf();
  const a = buildAcceptance(copy, input(), { now: NOW, terms: TERMS, method: "link", recordedBy: null, userAgent: null });
  const to = { contactId: "ctc1", firstName: "Sam", link: "https://quote.example/c/x", pdfUrl: "https://quote.example/c/x/accepted.pdf", termsUrl: `https://quote.example${termsHref("x")}` };

  it("the email is the one deposit request: the amount, e-transfer with the quote number, the schedule, both PDFs attached", () => {
    const m = acceptedEmailMessage(copy, a, to, { etransfer: "deposits@example.com", acceptedWhen: "Tuesday, November 3, 2026 at 2:14 pm" }, { email: "pat.quoter@example.com", firstName: "Pat" });
    if (m.type !== "Email") throw new Error("expected an email");
    expect(m.subject).toBe("Accepted: your quote Q-9001 from Titan Flooring");
    expect(m.html).toContain("Send it by e-transfer to deposits@example.com and put Q-9001 in the message.");
    expect(m.html).toContain(`$${a.stages[0].amount!.toFixed(2)}`);
    expect(m.html).toContain("Nothing is final until the deposit is in.");
    expect(m.html).toContain("Pat will call you to set your start date.");
    expect(m.attachments).toEqual([to.pdfUrl, to.termsUrl]);
    // No internal figure: the contractor and the line cost (5 a sq ft) never reach it.
    for (const leak of ["Crew Alpha", "$500.00", "Click install"]) expect(m.html).not.toContain(leak);
  });

  it("the text gives the deposit and how to pay it, in GSM-7", () => {
    const m = acceptedSmsMessage(copy, a, to, { etransfer: "deposits@example.com" }, { email: "pat.quoter@example.com", firstName: "Pat" });
    if (m.type !== "SMS") throw new Error("expected a text");
    expect(m.message).toContain("Thank you for accepting quote Q-9001!");
    expect(m.message).toContain("e-transfer it to deposits@example.com and put Q-9001 in the message");
    expect(m.message).toContain(to.link);
    expect(m.message).toMatch(/^[\x20-\x7e\n]+$/);
  });

  it("a deposit paid on site says so, and never says why", () => {
    expect(depositHow({ pay: "onsite" }, { etransfer: "x@example.com", quoteNumber: "Q-1" })).toBe("Hand it to your project manager on site.");
    expect(depositHow({ pay: "etransfer" }, { etransfer: "x@example.com", quoteNumber: "Q-1" })).not.toMatch(/HST|cash/i);
  });
});

describe("GHL: won, contract, lost", () => {
  it("finds the Sales pipeline's Project Won stage by name, and only when there is exactly one", () => {
    const list = [
      { id: "other", name: "STORE", stages: [{ id: "s1", name: "6a. Closed - Won" }] },
      { id: SALES_PIPELINE_ID, name: "(2) PROJECT: Sales Pipeline", stages: [{ id: "m", name: "*Meeting (Scheduled)* CCAM|GHL" }, { id: "w", name: "2. *Project Won* " }] },
    ];
    expect(wonStageId(list)).toBe("w");
    expect(wonStageId([{ ...list[1], stages: [] }])).toBeNull();
    expect(wonStageId([list[0]])).toBeNull();
  });

  it("won moves the stage and the status together, with the accepted total as the value, through the link route", () => {
    const r = buildWon({ contactId: "c1", opportunityId: "o1", wonStageId: "w", total: 1243, acceptedLink: "https://quote.example/c/x" });
    expect(r.mode).toBe("link");
    expect(JSON.parse(r.contactBody)).toEqual({});
    const body = JSON.parse(r.oppBody);
    expect(body).toMatchObject({ pipelineId: SALES_PIPELINE_ID, pipelineStageId: "w", status: "won", monetaryValue: 1243 });
    // The opportunity's Accepted Quote field gets the customer's link; Make 3710214 copies it to Notion's Quote Link.
    expect(body.customFields).toEqual([{ id: ACCEPT_FIELDS.acceptedQuote, field_value: "https://quote.example/c/x" }]);
    expect(JSON.parse(buildWon({ contactId: "c1", opportunityId: "o1", wonStageId: "w", total: 1243, acceptedLink: null }).oppBody).customFields).toBeUndefined();
  });

  it("a change only moves the value; a cancel only sets lost", () => {
    expect(JSON.parse(buildContract({ contactId: "c1", opportunityId: "o1", total: 1500, link: null }).oppBody)).toEqual({ monetaryValue: 1500 });
    expect(JSON.parse(buildLost({ contactId: "c1", opportunityId: "o1" }).oppBody)).toEqual({ status: "lost" });
  });
});

/** Keeps the fixture honest: the copy the tests accept is a real measured copy. */
it("fixture: a measured copy with two options", () => {
  const c: CustomerCopy = copyOf();
  expect(c.basis).toBe("Measured");
  expect(c.options).toHaveLength(2);
});

describe("the quote email once acceptance is on", () => {
  it("a measured quote says to accept it on the page; a preliminary never does", async () => {
    const { emailMessage } = await import("../src/lib/send/plan");
    const to = { contactId: "c", firstName: "Sam", link: "https://quote.example/c/x", pdfUrl: "https://quote.example/c/x/q.pdf" };
    const on = emailMessage(copyOf(), to, null, { acceptOnline: true });
    const off = emailMessage(copyOf(), to, null, {});
    const prelim = emailMessage(copyOf(quote({ basis: "Preliminary" })), to, null, { acceptOnline: true });
    expect(on.type === "Email" && on.html).toContain("and press Accept");
    expect(on.type === "Email" && on.html).toContain("Compare and accept");
    expect(off.type === "Email" && off.html).not.toContain("press Accept");
    expect(prelim.type === "Email" && prelim.html).not.toContain("press Accept");
  });
});
