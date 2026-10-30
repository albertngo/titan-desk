import { parseSignature, type Acceptance } from "@/lib/accept/plan";
import { termsLabel } from "@/lib/accept/terms";
import { changeWords, signedMoney } from "@/lib/change/diff";
import type { Payment } from "@/lib/billing/doc";
import { round2 } from "@/lib/calc";
import { PAGE, PdfDoc, textWidth, wrap, type Rgb } from "./pdfDoc";
import { discountLabel, hstRow, isLump, isSplit, scopeOf, itemHstNote, leadPrice, longDate, prelimNote, rangeText, stageFigure, stageNote, stagesOf, type CopyItem, type CopyOption, type CopyText, type CustomerCopy } from "./copy";

/**
 * The quote as a PDF, drawn from the customer copy only (never from live lines), so the file
 * attached to the email and the one downloaded from the page are the same document.
 */

const BLUE: Rgb = [0.118, 0.435, 1];
const INK: Rgb = [0.149, 0.188, 0.235];
const DIM: Rgb = [0.4, 0.443, 0.498];
const FAINT: Rgb = [0.6, 0.64, 0.68];
const RULE: Rgb = [0.894, 0.91, 0.933];
const HEAD: Rgb = [0.933, 0.945, 0.961];
const SOFT: Rgb = [0.91, 0.94, 1];

const M = 48;
const RIGHT = PAGE.width - M;
const TOP = PAGE.height - M;
const BOTTOM = 72;

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const plain = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 });
const money = (n: number) => cad.format(n);

/* Item table columns. */
const COL = { n: M, item: M + 22, itemW: 268, qty: 412, unit: 482, amount: RIGHT };

/** What the accepted stamp says (2026-10-27): drawn on the accepted PDF, whose copy is acceptedCopy(). */
export type AcceptedStamp = { acceptance: Acceptance; when: string };

const GREEN: Rgb = [0.09, 0.42, 0.27];
const MINT: Rgb = [0.92, 0.97, 0.94];

export function methodWords(a: Acceptance): string {
  if (a.method === "store") return "In our store, signed below.";
  if (a.method === "staff") return `Recorded by ${a.recordedBy ?? "staff"} on the customer's behalf: ${a.reason ?? ""}`;
  return "Online, from the link we sent.";
}

/**
 * An invoice or receipt (Albert, 2026-10-30): the same drawing as the quote, titled and numbered as the document,
 * with the HST number, the payments received and the balance owing in place of the payment schedule.
 */
export type BillStamp = { title: "INVOICE" | "RECEIPT"; number: string; issuedOn: string; asOf: string; project: string | null; hstNumber: string | null; payments: Payment[]; paid: number; balance: number; credit: number };

export function quotePdf(copy: CustomerCopy, stamp: AcceptedStamp | null = null, bill: BillStamp | null = null): Uint8Array<ArrayBuffer> {
  const doc = new PdfDoc(bill ? `Titan Flooring ${bill.title.toLowerCase()} ${bill.number}` : `Titan Flooring quote ${copy.quoteNumber}`);
  let y = TOP;

  const newPage = () => {
    doc.addPage();
    y = TOP;
  };
  /** Room for `h` points more, or a fresh page. Returns true when it turned the page. */
  const room = (h: number) => {
    if (y - h >= BOTTOM) return false;
    newPage();
    return true;
  };

  /** An invoice or receipt whose HST is on the materials only: shown inside that section (2026-10-30). */
  const materialsHst = (o: CopyOption) => bill !== null && !copy.showHst && o.totals.hst !== 0 && o.sections.some((s) => s.name === "Materials");

  /* ---------- letterhead ---------- */
  newPage();
  const c = copy.company;
  doc.text(M, y - 16, c.name.toUpperCase(), { font: "B", size: 17, color: BLUE });
  let ly = y - 32;
  for (const l of [c.address, [c.phone, c.email].filter(Boolean).join("  ·  "), c.website, bill?.hstNumber ? `HST # ${bill.hstNumber}` : null]) {
    if (!l) continue;
    doc.text(M, ly, l, { size: 8.5, color: DIM });
    ly -= 11;
  }
  doc.text(RIGHT, y - 16, bill ? bill.title : copy.basis === "Preliminary" ? "PRELIMINARY QUOTE" : "QUOTE", { font: "B", size: 13, color: INK, align: "right" });
  let ry = y - 32;
  const meta = bill
    ? [[bill.title === "INVOICE" ? "Invoice" : "Receipt", bill.number], ["Date", longDate(bill.issuedOn)], ["Quote", copy.quoteNumber], ...(bill.project ? [["Project", bill.project]] : [])]
    : [["Quote", `${copy.quoteNumber}${copy.version !== null ? ` · v${copy.version}` : ""}`], ["Date", longDate(copy.sentOn)], ...(copy.validUntil ? [["Valid until", longDate(copy.validUntil)]] : [])];
  for (const [k, v] of meta) {
    doc.text(RIGHT - 110, ry, k, { size: 8.5, color: DIM, align: "right" });
    doc.text(RIGHT, ry, v, { font: "B", size: 8.5, color: INK, align: "right" });
    ry -= 12;
  }
  y = Math.min(ly, ry) - 8;
  doc.line(M, y, RIGHT, y, RULE);
  y -= 18;

  doc.text(M, y, bill ? "BILL TO" : "PREPARED FOR", { font: "B", size: 7.5, color: FAINT });
  y -= 14;
  doc.text(M, y, copy.customer.name ?? "", { font: "B", size: 11, color: INK });
  const site = [copy.customer.siteAddress, copy.customer.siteCity].filter(Boolean).join(", ");
  if (site) {
    y -= 13;
    doc.text(M, y, site, { size: 9.5, color: DIM });
  }
  y -= 20;

  /* ---------- the accepted stamp (2026-10-27) ---------- */
  if (stamp) {
    const a = stamp.acceptance;
    const sig = parseSignature(a.signature);
    const lines = [
      `Accepted by ${a.name} on ${stamp.when}.`,
      `${(a.picks?.length ?? 1) > 1 ? "Options" : "Option"}: ${a.option.name}${a.addOns.length ? `, with ${a.addOns.map((x) => x.description).join(", ")}` : ""}.`,
      ...wrap(methodWords(a), "R", 9, RIGHT - M - (sig ? 200 : 24)),
      `Agreed to the Project Expectations, ${termsLabel(a.terms)}.`,
    ];
    const h = Math.max(lines.length * 12 + 28, sig ? 84 : 0);
    doc.rect(M, y - h + 8, RIGHT - M, h, MINT);
    doc.text(M + 12, y - 8, "ACCEPTED", { font: "B", size: 10, color: GREEN });
    lines.forEach((l, i) => doc.text(M + 12, y - 22 - i * 12, l, { size: 9, color: INK }));
    if (sig) {
      // The 1000 × 300 drawing box, scaled into 170 × 51 points at the right of the stamp, y flipped.
      const x0 = RIGHT - 182;
      const top = y - 6;
      doc.strokes(sig.map((st) => st.map(([x, yy]) => [x0 + (x / 1000) * 170, top - (yy / 300) * 51] as [number, number])), INK, 1);
      doc.line(x0, top - 56, x0 + 170, top - 56, RULE, 0.5);
      doc.text(x0, top - 66, "Signature", { size: 7, color: FAINT });
    }
    y -= h + 10;
  }

  /* ---------- a change after acceptance (2026-10-27): what changed, before the full quote ---------- */
  if (copy.change && copy.options[0]) {
    const ch = copy.change;
    const lines = [
      ...ch.items.flatMap((it) => wrap(changeWords(it), "R", 9, RIGHT - M - 24)),
      `Change, before HST: ${signedMoney(ch.difference, money)}`,
      `Total was ${money(ch.before.total)}, now ${money(copy.options[0].totals.total)}. The difference is on the final payment.`,
    ];
    const h = lines.length * 12 + 30;
    room(h + 10);
    doc.rect(M, y - h + 8, RIGHT - M, h, SOFT);
    doc.text(M + 12, y - 8, `UPDATED QUOTE, CHANGE ${ch.no}: WHAT CHANGED SINCE ${longDate(ch.sinceOn).toUpperCase()}`, { font: "B", size: 9, color: BLUE });
    lines.forEach((l, i) => doc.text(M + 12, y - 22 - i * 12, l, { size: 9, color: INK, font: i >= lines.length - 2 ? "B" : "R" }));
    y -= h + 10;
  }

  for (const note of [
    copy.basis === "Preliminary" ? prelimNote(copy) : null,
    isLump(copy) ? "Priced as one sum for the project. The items listed show what it includes." : null,
  ]) {
    if (!note) continue;
    const lines = wrap(note, "R", 9, RIGHT - M - 24);
    const h = lines.length * 12 + 14;
    doc.rect(M, y - h + 8, RIGHT - M, h, SOFT);
    lines.forEach((l, i) => doc.text(M + 12, y - 6 - i * 12, l, { size: 9, color: INK }));
    y -= h + 10;
  }

  /* ---------- options ---------- */
  copy.options.forEach((o, i) => {
    if (i > 0) newPage();
    else room(160);
    option(o, copy.options.length > 1 ? i + 1 : null);
  });
  if (bill) payments(bill);

  /* ---------- footers, once the page count is known ---------- */
  const contact = [c.phone, c.email].filter(Boolean).join("  ·  ");
  for (let p = 0; p < doc.pageCount; p++) {
    doc.line(M, 52, RIGHT, 52, RULE, 0.75, p);
    if (contact) doc.text(M, 38, `Questions? ${contact}`, { size: 8, color: DIM, page: p });
    doc.text(RIGHT, 38, `${bill ? bill.number : copy.quoteNumber}  ·  Page ${p + 1} of ${doc.pageCount}`, { size: 8, color: FAINT, align: "right", page: p });
  }
  return doc.bytes();

  function tableHead(cont: boolean) {
    doc.rect(M, y - 6, RIGHT - M, 18, HEAD);
    doc.text(COL.n, y, "#", { font: "B", size: 8, color: DIM });
    doc.text(COL.item, y, cont ? "Item (continued)" : "Item", { font: "B", size: 8, color: DIM });
    doc.text(COL.qty, y, "Quantity", { font: "B", size: 8, color: DIM, align: "right" });
    // A lump-sum quote has no price columns: the totals block is the price (2026-10-22).
    if (!isLump(copy)) {
      doc.text(COL.unit, y, "Unit price", { font: "B", size: 8, color: DIM, align: "right" });
      doc.text(COL.amount - 4, y, "Amount", { font: "B", size: 8, color: DIM, align: "right" });
    }
    y -= 22;
  }

  function option(o: CopyOption, number: number | null) {
    // With flooring and stairs options (2026-10-28) the title says which: "Stairs · Option 3: Red oak caps".
    const title = number ? `${isSplit(copy) ? `${scopeOf(o)} · ` : ""}Option ${number}: ${o.name}` : o.name;
    const titleLines = wrap(title, "B", 14, RIGHT - M - (o.recommended ? 90 : 0));
    titleLines.forEach((l, k) => {
      doc.text(M, y - 4, l, { font: "B", size: 14, color: INK });
      if (k === 0 && o.recommended && number) doc.text(RIGHT, y - 4, "RECOMMENDED", { font: "B", size: 8, color: BLUE, align: "right" });
      y -= 18;
    });
    if (o.description) {
      for (const l of wrap(o.description, "R", 9.5, RIGHT - M)) {
        room(13);
        doc.text(M, y, l, { size: 9.5, color: DIM });
        y -= 13;
      }
    }
    y -= 8;
    tableHead(false);

    // A receipt with HST on the materials only (Albert, 2026-10-30: "put the HST right inside the Material section",
    // then "more singled out"): the Materials section carries a blue bar down its left and says HST APPLIES, its HST
    // and its total with HST sit on a tinted band at its end, and every other section says NO HST.
    const hstInMaterials = materialsHst(o);
    for (const s of o.sections) {
      if (room(40)) tableHead(true);
      const mat = hstInMaterials && s.name === "Materials";
      const head = s.name.toUpperCase();
      const startY = y + 10;
      const startPage = doc.pageCount;
      doc.text(COL.item, y, head, { font: "B", size: 8, color: BLUE });
      if (hstInMaterials && s.lines.some((l) => l.kind === "item")) doc.text(COL.item + textWidth(head, "B", 8) + 6, y, mat ? "·  HST APPLIES" : "·  NO HST", { font: "B", size: 7.5, color: mat ? BLUE : FAINT });
      if (s.total !== null && s.lines.some((l) => l.kind === "item" && !l.optional)) doc.text(COL.amount - 4, y, money(s.total), { font: "B", size: 8, color: DIM, align: "right" });
      y -= 14;
      for (const l of s.lines) row(l);
      if (mat) {
        if (room(40)) tableHead(true);
        const h = s.total !== null ? 34 : 19;
        doc.rect(COL.item - 6, y - h + 11, RIGHT - COL.item + 6, h, SOFT);
        doc.text(COL.item, y, "HST (13%) on materials", { size: 9, color: INK });
        doc.text(COL.amount - 4, y, money(o.totals.hst), { size: 9, color: INK, align: "right" });
        y -= 15;
        if (s.total !== null) {
          doc.text(COL.item, y, "Materials with HST", { font: "B", size: 9, color: INK });
          doc.text(COL.amount - 4, y, money(round2(s.total + o.totals.hst)), { font: "B", size: 9, color: INK, align: "right" });
          y -= 15;
        }
        // The bar, on this page only: a section split across pages gets none rather than a broken one.
        if (doc.pageCount === startPage) doc.line(COL.item - 10, startY, COL.item - 10, y + 7, BLUE, 2);
      }
      y -= 4;
    }

    totals(o);
    if (o.exclusions.length) {
      room(30);
      doc.text(M, y, "NOT INCLUDED", { font: "B", size: 7.5, color: FAINT });
      y -= 13;
      for (const e of o.exclusions) {
        for (const [k, l] of wrap(e, "R", 9, RIGHT - M - 12).entries()) {
          room(12);
          if (k === 0) doc.text(M, y, "•", { size: 9, color: DIM });
          doc.text(M + 12, y, l, { size: 9, color: INK });
          y -= 12;
        }
      }
    }
  }

  function row(l: CopyItem | CopyText) {
    if (l.kind === "text") {
      const lines = wrap(l.text, "R", 9, COL.itemW + 140);
      const notes = l.note ? wrap(l.note, "R", 8, COL.itemW + 140) : [];
      if (room(lines.length * 12 + notes.length * 10 + 4)) tableHead(true);
      for (const t of lines) {
        doc.text(COL.item, y, t, { size: 9, color: DIM });
        y -= 12;
      }
      for (const t of notes) {
        doc.text(COL.item, y, t, { size: 8, color: FAINT });
        y -= 10;
      }
      y -= 4;
      return;
    }
    const lines = wrap(l.description, "R", 9, COL.itemW);
    const sub = [l.note, l.wastePct ? `includes ${l.wastePct}% waste allowance` : null, l.minimum ? "minimum charge" : null, bill && !copy.showHst && l.hst === "plus" ? null : itemHstNote(l)].filter(Boolean).join(" · ");
    const notes = sub ? wrap(sub, "R", 8, COL.itemW) : [];
    if (room(lines.length * 12 + notes.length * 10 + 6)) tableHead(true);
    const color = l.optional ? DIM : INK;
    if (l.n !== null) doc.text(COL.n, y, String(l.n), { size: 9, color: FAINT });
    lines.forEach((t, k) => doc.text(COL.item, y - k * 12, t, { size: 9, color }));
    if (l.qty !== null) doc.text(COL.qty, y, `${plain.format(l.qty)}${l.uom ? ` ${l.uom}` : ""}`, { size: 9, color, align: "right" });
    if (l.unitPrice !== null) doc.text(COL.unit, y, money(l.unitPrice), { size: 9, color, align: "right" });
    if (l.amount !== null) doc.text(COL.amount - 4, y, l.optional ? `Optional · ${money(l.amount)}` : l.added ? `Added · ${money(l.amount)}` : money(l.amount), { size: 9, font: l.optional ? "R" : "B", color, align: "right" });
    y -= lines.length * 12;
    for (const t of notes) {
      doc.text(COL.item, y + 1, t, { size: 8, color: FAINT });
      y -= 10;
    }
    y -= 5;
    doc.line(COL.item, y + 9, RIGHT, y + 9, RULE, 0.5);
  }

  function totals(o: CopyOption) {
    const t = o.totals;
    const r = o.range;
    const rows: [string, string, boolean][] = [];
    // Lump sum: no breakdown of the price, so no discount rows either; nor on a range, which has no exact figure (2026-10-27).
    if (t.discount !== 0 && !isLump(copy) && !r) {
      rows.push(["Subtotal before discount", money(t.preDiscount), false]);
      rows.push([discountLabel(copy), money(t.discount), false]);
    }
    // Leads before HST, like the email and the text (Albert, 2026-10-24): the blue bar is the price
    // before HST; the tax and the total with it follow under it.
    const lead = leadPrice(copy, t);
    const h = hstRow(copy, t);
    // With the HST shown inside the Materials section (2026-10-30), the totals don't repeat it.
    const after: [string, string][] = materialsHst(o) ? [] : [[h.label, h.amount === null ? "Not included" : r ? "On the final price" : money(h.amount)]];
    if (lead.addsHst) after.push([r ? "With HST" : "Total with HST", r ? rangeText(r.lowWithHst, r.highWithHst) : money(t.total)]);
    // The schedule as frozen (2026-10-27); a range's is in shares of the final price, which isn't known yet.
    const x1 = r ? 300 : 340;
    const pay = stagesOf(o).map((s) => ({
      k: `${s.label}${s.amount !== null && s.kind === "share" && s.pct !== null ? ` (${s.pct}%)` : ""}`,
      v: stageFigure(s, money),
      note: stageNote(s) ? wrap(stageNote(s), "R", 7.5, RIGHT - x1 - 90) : [],
    }));
    // An invoice or receipt shows what was paid instead of the schedule (payments(), below).
    if (bill) pay.length = 0;
    room(rows.length * 15 + 42 + after.length * 15 + pay.reduce((a, p) => a + 13 + p.note.length * 10, 0) + 30);
    y -= 6;
    // A range's label and its two figures need a wider bar.
    const x0 = r ? 300 : 340;
    for (const [k, v] of rows) {
      doc.text(x0, y, k, { size: 9, color: DIM });
      doc.text(COL.amount - 4, y, v, { size: 9, color: INK, align: "right" });
      y -= 15;
    }
    y -= 8;
    doc.rect(x0 - 8, y - 7, RIGHT - x0 + 8, 22, BLUE);
    doc.text(x0, y, `${r ? "Estimated range" : isLump(copy) ? "Price" : "Subtotal"} before HST`, { font: "B", size: 11, color: [1, 1, 1] });
    doc.text(COL.amount - 4, y, r ? rangeText(r.low, r.high) : money(t.subtotal), { font: "B", size: 11, color: [1, 1, 1], align: "right" });
    y -= 22;
    for (const [k, v] of after) {
      const strong = k === "Total with HST" || k === "With HST";
      doc.text(x0, y, k, { font: strong ? "B" : "R", size: 9, color: strong ? INK : DIM });
      doc.text(COL.amount - 4, y, v, { font: strong ? "B" : "R", size: 9, color: INK, align: "right" });
      y -= 15;
    }
    if (bill) return;
    y -= 15;
    doc.text(x0, y, r ? "PAYMENT SCHEDULE, ON THE FINAL PRICE" : lead.addsHst ? "PAYMENT SCHEDULE, WITH HST" : "PAYMENT SCHEDULE", { font: "B", size: 7.5, color: FAINT });
    y -= 13;
    for (const p of pay) {
      doc.text(x0, y, p.k, { size: 9, color: DIM });
      doc.text(COL.amount - 4, y, p.v, { size: 9, color: INK, align: "right" });
      y -= 13;
      for (const l of p.note) {
        doc.text(x0, y + 2, l, { size: 7.5, color: FAINT });
        y -= 10;
      }
    }
    y -= 12;
  }

  /** The payments received, as read from the payments log on the day it was exported, and what is left to pay. */
  function payments(b: BillStamp) {
    room(60 + b.payments.length * 14);
    y -= 6;
    doc.text(M, y, `PAYMENTS RECEIVED, AS OF ${longDate(b.asOf).toUpperCase()}`, { font: "B", size: 7.5, color: FAINT });
    y -= 16;
    doc.rect(M, y - 6, RIGHT - M, 18, HEAD);
    doc.text(M + 6, y, "Date", { font: "B", size: 8, color: DIM });
    doc.text(M + 130, y, "Method", { font: "B", size: 8, color: DIM });
    doc.text(M + 250, y, "Reference", { font: "B", size: 8, color: DIM });
    doc.text(COL.amount - 4, y, "Amount", { font: "B", size: 8, color: DIM, align: "right" });
    y -= 20;
    if (b.payments.length === 0) {
      doc.text(M + 6, y, "No payments received yet.", { size: 9, color: DIM });
      y -= 16;
    }
    for (const p of b.payments) {
      if (room(16)) y -= 4;
      doc.text(M + 6, y, p.date ? longDate(p.date) : "", { size: 9, color: INK });
      doc.text(M + 130, y, p.method ?? "", { size: 9, color: INK });
      doc.text(M + 250, y, wrap(p.reference ?? "", "R", 9, 170)[0] ?? "", { size: 9, color: DIM });
      doc.text(COL.amount - 4, y, money(p.amount), { size: 9, color: INK, align: "right" });
      y -= 9;
      doc.line(M, y, RIGHT, y, RULE, 0.5);
      y -= 12;
    }
    room(60);
    const x0 = 340;
    y -= 4;
    doc.text(x0, y, "Total paid", { size: 9, color: DIM });
    doc.text(COL.amount - 4, y, money(b.paid), { size: 9, color: INK, align: "right" });
    y -= 22;
    doc.rect(x0 - 8, y - 7, RIGHT - x0 + 8, 22, b.credit > 0 || b.balance > 0 ? BLUE : GREEN);
    doc.text(x0, y, b.credit > 0 ? "Credit" : b.balance > 0 ? "Balance owing" : "Paid in full", { font: "B", size: 11, color: [1, 1, 1] });
    doc.text(COL.amount - 4, y, money(b.credit > 0 ? b.credit : b.balance), { font: "B", size: 11, color: [1, 1, 1], align: "right" });
    y -= 22;
  }
}
