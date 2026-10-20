import { PAGE, PdfDoc, wrap, type Rgb } from "./pdfDoc";
import { hstRow, itemHstNote, longDate, showsRates, type CopyItem, type CopyOption, type CopyText, type CustomerCopy } from "./copy";

/**
 * The quote as a PDF, drawn from the customer copy only (never from live lines), so the file
 * attached to the email and the one downloaded from the page are the same document. A copy sent
 * with the total only (2026-10-20) has no unit price or amount column and no section subtotal;
 * an optional add-on still says what it would add.
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

export function quotePdf(copy: CustomerCopy): Uint8Array<ArrayBuffer> {
  const doc = new PdfDoc(`Titan Flooring quote ${copy.quoteNumber}`);
  const rates = showsRates(copy);
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

  /* ---------- letterhead ---------- */
  newPage();
  const c = copy.company;
  doc.text(M, y - 16, c.name.toUpperCase(), { font: "B", size: 17, color: BLUE });
  let ly = y - 32;
  for (const l of [c.address, [c.phone, c.email].filter(Boolean).join("  ·  "), c.website, c.hstNumber ? `HST # ${c.hstNumber}` : null]) {
    if (!l) continue;
    doc.text(M, ly, l, { size: 8.5, color: DIM });
    ly -= 11;
  }
  doc.text(RIGHT, y - 16, copy.basis === "Preliminary" ? "PRELIMINARY QUOTE" : "QUOTE", { font: "B", size: 13, color: INK, align: "right" });
  let ry = y - 32;
  for (const [k, v] of [
    ["Quote", `${copy.quoteNumber}${copy.version !== null ? ` · v${copy.version}` : ""}`],
    ["Date", longDate(copy.sentOn)],
    ["Valid until", longDate(copy.validUntil)],
  ]) {
    doc.text(RIGHT - 110, ry, k, { size: 8.5, color: DIM, align: "right" });
    doc.text(RIGHT, ry, v, { font: "B", size: 8.5, color: INK, align: "right" });
    ry -= 12;
  }
  y = Math.min(ly, ry) - 8;
  doc.line(M, y, RIGHT, y, RULE);
  y -= 18;

  doc.text(M, y, "PREPARED FOR", { font: "B", size: 7.5, color: FAINT });
  y -= 14;
  doc.text(M, y, copy.customer.name ?? "", { font: "B", size: 11, color: INK });
  const site = [copy.customer.siteAddress, copy.customer.siteCity].filter(Boolean).join(", ");
  if (site) {
    y -= 13;
    doc.text(M, y, site, { size: 9.5, color: DIM });
  }
  y -= 20;

  if (copy.basis === "Preliminary") {
    const lines = wrap(
      "This is a preliminary estimate, based on what we know so far. We confirm the final price once we have measured the space.",
      "R",
      9,
      RIGHT - M - 24,
    );
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

  /* ---------- footers, once the page count is known ---------- */
  const contact = [c.phone, c.email].filter(Boolean).join("  ·  ");
  for (let p = 0; p < doc.pageCount; p++) {
    doc.line(M, 52, RIGHT, 52, RULE, 0.75, p);
    if (contact) doc.text(M, 38, `Questions? ${contact}`, { size: 8, color: DIM, page: p });
    doc.text(RIGHT, 38, `${copy.quoteNumber}  ·  Page ${p + 1} of ${doc.pageCount}`, { size: 8, color: FAINT, align: "right", page: p });
  }
  return doc.bytes();

  function tableHead(cont: boolean) {
    doc.rect(M, y - 6, RIGHT - M, 18, HEAD);
    doc.text(COL.n, y, "#", { font: "B", size: 8, color: DIM });
    doc.text(COL.item, y, cont ? "Item (continued)" : "Item", { font: "B", size: 8, color: DIM });
    doc.text(COL.qty, y, "Quantity", { font: "B", size: 8, color: DIM, align: "right" });
    if (rates) {
      doc.text(COL.unit, y, "Unit price", { font: "B", size: 8, color: DIM, align: "right" });
      doc.text(COL.amount - 4, y, "Amount", { font: "B", size: 8, color: DIM, align: "right" });
    }
    y -= 22;
  }

  function option(o: CopyOption, number: number | null) {
    const title = number ? `Option ${number}: ${o.name}` : o.name;
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

    for (const s of o.sections) {
      if (room(40)) tableHead(true);
      doc.text(COL.item, y, s.name.toUpperCase(), { font: "B", size: 8, color: BLUE });
      if (rates && s.lines.some((l) => l.kind === "item" && !l.optional)) doc.text(COL.amount - 4, y, money(s.total), { font: "B", size: 8, color: DIM, align: "right" });
      y -= 14;
      for (const l of s.lines) row(l);
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
    const priced = rates || l.optional;
    const lines = wrap(l.description, "R", 9, priced ? COL.itemW : COL.itemW + 80);
    const sub = [l.note, l.wastePct ? `includes ${l.wastePct}% waste allowance` : null, priced && l.minimum ? "minimum charge" : null, itemHstNote(l)].filter(Boolean).join(" · ");
    const notes = sub ? wrap(sub, "R", 8, COL.itemW) : [];
    if (room(lines.length * 12 + notes.length * 10 + 6)) tableHead(true);
    const color = l.optional ? DIM : INK;
    if (l.n !== null) doc.text(COL.n, y, String(l.n), { size: 9, color: FAINT });
    lines.forEach((t, k) => doc.text(COL.item, y - k * 12, t, { size: 9, color }));
    if (l.qty !== null) doc.text(COL.qty, y, `${plain.format(l.qty)}${l.uom ? ` ${l.uom}` : ""}`, { size: 9, color, align: "right" });
    if (rates && l.unitPrice !== null) doc.text(COL.unit, y, money(l.unitPrice), { size: 9, color, align: "right" });
    if (priced) doc.text(COL.amount - 4, y, l.optional ? `Optional · ${money(l.amount)}` : money(l.amount), { size: 9, font: l.optional ? "R" : "B", color, align: "right" });
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
    const rows: [string, string, boolean][] = [];
    if (t.discount !== 0) {
      rows.push(["Subtotal before discount", money(t.preDiscount), false]);
      rows.push([`Discount (${Math.round(copy.discountRate * 1000) / 10}%)`, money(t.discount), false]);
    }
    rows.push(["Subtotal", money(t.subtotal), false]);
    const h = hstRow(copy, t);
    rows.push([h.label, h.amount !== null ? money(h.amount) : "Not included", false]);
    const pay: [string, number][] = [
      ["Deposit (35%)", t.payment1],
      ["Second payment (35%)", t.payment2],
      ["Final payment", t.paymentFinal],
    ];
    room(rows.length * 15 + 42 + pay.length * 13 + 30);
    y -= 6;
    const x0 = 340;
    for (const [k, v] of rows) {
      doc.text(x0, y, k, { size: 9, color: DIM });
      doc.text(COL.amount - 4, y, v, { size: 9, color: INK, align: "right" });
      y -= 15;
    }
    y -= 8;
    doc.rect(x0 - 8, y - 7, RIGHT - x0 + 8, 22, BLUE);
    doc.text(x0, y, "Total", { font: "B", size: 11, color: [1, 1, 1] });
    doc.text(COL.amount - 4, y, money(t.total), { font: "B", size: 11, color: [1, 1, 1], align: "right" });
    y -= 30;
    doc.text(x0, y, "PAYMENT SCHEDULE", { font: "B", size: 7.5, color: FAINT });
    y -= 13;
    for (const [k, v] of pay) {
      doc.text(x0, y, k, { size: 9, color: DIM });
      doc.text(COL.amount - 4, y, money(v), { size: 9, color: INK, align: "right" });
      y -= 13;
    }
    y -= 12;
  }
}
