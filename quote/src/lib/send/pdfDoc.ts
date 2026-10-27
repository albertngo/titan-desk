/**
 * A very small PDF writer: text in Helvetica and Helvetica-Bold, filled rectangles and lines,
 * on US Letter pages. No dependencies, no fonts to embed (the 14 standard fonts are built into
 * every PDF reader), so the quote PDF is made in a few milliseconds anywhere and tested here.
 *
 * Text is encoded as WinAnsi (Windows-1252): accents, curly quotes, dashes and bullets print;
 * anything else prints as "?". Widths are the standard Adobe metrics, so wrapping is exact.
 */

export type Font = "R" | "B";
export type Rgb = readonly [number, number, number];

/* Adobe AFM widths for codes 32–126, in 1/1000 em. */
const REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
  584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584,
];
/** WinAnsi codes above 126 that matter in a quote, and their widths (regular, bold). */
const EXTRA: Record<number, [number, number]> = {
  0x80: [556, 556], // €
  0x85: [1000, 1000], // …
  0x91: [222, 278],
  0x92: [222, 278], // ’
  0x93: [333, 500],
  0x94: [333, 500], // ”
  0x95: [350, 350], // •
  0x96: [556, 556], // –
  0x97: [1000, 1000], // —
  0xa0: [278, 278],
  0xa9: [737, 737], // ©
  0xb0: [400, 400], // °
  0xb7: [278, 278], // ·
  0xbd: [834, 834], // ½
  0xd7: [584, 584], // ×
};
const UNI: Record<string, number> = { "€": 0x80, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97 };

/** One character to its WinAnsi byte; "?" for anything the standard fonts can't print. */
function code(ch: string): number {
  if (ch in UNI) return UNI[ch];
  const c = ch.codePointAt(0)!;
  if (c >= 32 && c <= 126) return c;
  if (c >= 0xa0 && c <= 0xff) return c;
  if (c === 0x2009 || c === 0x202f) return 32; // thin spaces
  return 63;
}

/** Text as WinAnsi bytes: composed accents, tabs and newlines as spaces, nothing unprintable. */
export function encode(text: string): number[] {
  return [...text.normalize("NFC").replace(/[\t\r\n]+/g, " ")].map(code);
}

function charWidth(c: number, font: Font): number {
  if (c >= 32 && c <= 126) return (font === "B" ? BOLD : REG)[c - 32];
  const e = EXTRA[c];
  if (e) return font === "B" ? e[1] : e[0];
  if (c >= 0xc0) return c >= 0xe0 ? (font === "B" ? 611 : 556) : font === "B" ? 722 : 667; // accented letters
  return 556;
}

export function textWidth(text: string, font: Font, size: number): number {
  return (encode(text).reduce((a, c) => a + charWidth(c, font), 0) * size) / 1000;
}

/** Break text into lines no wider than `max`; a word longer than a line is split. */
export function wrap(text: string, font: Font, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = "";
    for (let w of words) {
      while (textWidth(w, font, size) > max) {
        let cut = w.length - 1;
        while (cut > 1 && textWidth(w.slice(0, cut), font, size) > max) cut--;
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const next = line ? `${line} ${w}` : w;
      if (textWidth(next, font, size) <= max) line = next;
      else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

const n2 = (x: number) => (Math.round(x * 100) / 100).toString();
const rgb = (c: Rgb) => c.map((v) => n2(v)).join(" ");

function pdfString(text: string): string {
  return (
    "(" +
    encode(text)
      .map((c) => (c === 40 || c === 41 || c === 92 ? `\\${String.fromCharCode(c)}` : c < 32 || c > 126 ? `\\${c.toString(8).padStart(3, "0")}` : String.fromCharCode(c)))
      .join("") +
    ")"
  );
}

export const PAGE = { width: 612, height: 792 } as const;

export class PdfDoc {
  private pages: string[][] = [];

  constructor(private title: string) {}

  get pageCount() {
    return this.pages.length;
  }

  addPage(): number {
    this.pages.push([]);
    return this.pages.length - 1;
  }

  private ops(page?: number): string[] {
    if (this.pages.length === 0) this.addPage();
    return this.pages[page ?? this.pages.length - 1];
  }

  /** Text with its baseline at y (points from the bottom). align right/center measure from x. */
  text(x: number, y: number, s: string, o: { font?: Font; size?: number; color?: Rgb; align?: "left" | "right" | "center"; page?: number } = {}) {
    const font = o.font ?? "R";
    const size = o.size ?? 10;
    const w = o.align && o.align !== "left" ? textWidth(s, font, size) : 0;
    const left = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.ops(o.page).push(`BT /F${font} ${n2(size)} Tf ${rgb(o.color ?? [0, 0, 0])} rg ${n2(left)} ${n2(y)} Td ${pdfString(s)} Tj ET`);
  }

  rect(x: number, y: number, w: number, h: number, fill: Rgb, page?: number) {
    this.ops(page).push(`${rgb(fill)} rg ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f`);
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Rgb, width = 0.75, page?: number) {
    this.ops(page).push(`${rgb(color)} RG ${n2(width)} w ${n2(x1)} ${n2(y1)} m ${n2(x2)} ${n2(y2)} l S`);
  }

  /** Pen strokes (a drawn signature, 2026-10-27): each a polyline, round caps and joins. */
  strokes(lines: [number, number][][], color: Rgb, width = 1.2, page?: number) {
    const ops = this.ops(page);
    for (const pts of lines) {
      if (pts.length < 2) continue;
      ops.push(`${rgb(color)} RG ${n2(width)} w 1 J 1 j ${pts.map(([x, y], i) => `${n2(x)} ${n2(y)} ${i === 0 ? "m" : "l"}`).join(" ")} S`);
    }
  }

  /** The finished file. */
  bytes(): Uint8Array<ArrayBuffer> {
    if (this.pages.length === 0) this.addPage();
    const objs: string[] = [];
    const add = (body: string) => objs.push(body) && objs.length;
    const catalog = add("");
    const pagesObj = add("");
    const fontR = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const fontB = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids: number[] = [];
    for (const ops of this.pages) {
      const stream = ops.join("\n");
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      kids.push(
        add(
          `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
            `/Resources << /Font << /FR ${fontR} 0 R /FB ${fontB} 0 R >> >> /Contents ${content} 0 R >>`,
        ),
      );
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    const info = add(`<< /Title ${pdfString(this.title)} /Producer (Titan Quotes) >>`);

    let out = "%PDF-1.4\n%âãÏÓ\n";
    const offsets: number[] = [];
    objs.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    out += offsets.map((o) => `${o.toString().padStart(10, "0")} 00000 n \n`).join("");
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    // Every character above is one byte (strings are escaped to ASCII), so length = byte offset.
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
