import type { CardSheet } from "@/lib/payout/cards";

/**
 * A payout card drawn as a picture (2026-11-04), in the browser, from `cardSheet()`: a phone-shaped page a contractor
 * can read in CompanyCam's timeline or a text. Words and figures come only from the sheet, so the picture says
 * exactly what the tab shows. White page, the logo's blue, system fonts (no web font to load).
 */

const W = 1080;
const PAD = 64;
const BLUE = "#283890";
const INK = "#1c2230";
const DIM = "#5b6475";
const RULE = "#d9dde5";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

type Op = (ctx: CanvasRenderingContext2D, y: number) => void;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Lay the sheet out once to measure it, then draw it on a canvas of that height. */
export function drawCard(sheet: CardSheet): HTMLCanvasElement {
  const measure = document.createElement("canvas").getContext("2d")!;
  const ops: Op[] = [];
  let y = 0;
  const font = (px: number, weight = 400) => `${weight} ${px}px ${FONT}`;
  const text = (s: string, x: number, px: number, color: string, weight = 400, align: CanvasTextAlign = "left") => {
    const at = y;
    ops.push((ctx, top) => {
      ctx.font = font(px, weight);
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = "top";
      ctx.fillText(s, x, top + at);
    });
  };
  const rule = (color = RULE, h = 2) => {
    const at = y;
    ops.push((ctx, top) => {
      ctx.fillStyle = color;
      ctx.fillRect(PAD, top + at, W - PAD * 2, h);
    });
  };
  const lines = (s: string, x: number, width: number, px: number, color: string, weight = 400, gap = 1.35) => {
    measure.font = font(px, weight);
    for (const l of wrap(measure, s, width)) {
      text(l, x, px, color, weight);
      y += Math.round(px * gap);
    }
  };

  // Band
  const band = 150;
  ops.push((ctx, top) => {
    ctx.fillStyle = BLUE;
    ctx.fillRect(0, top, W, band);
  });
  y = 40;
  text("TITAN FLOORING", PAD, 24, "#cfd6ff", 700);
  y += 36;
  text(sheet.title, PAD, 46, "#ffffff", 700);
  if (sheet.ref) text(sheet.ref, W - PAD, 28, "#ffffff", 600, "right");
  y = band + 40;

  // Who, where, when
  for (const [k, v] of sheet.rows) {
    text(k, PAD, 26, DIM, 500);
    lines(v, PAD + 220, W - PAD * 2 - 220, 30, INK, k === "Contractor" ? 700 : 500);
    y += 8;
  }
  y += 16;
  rule(INK, 3);
  y += 18;
  text("Work", PAD, 24, DIM, 600);
  text("Amount", W - PAD, 24, DIM, 600, "right");
  y += 40;
  rule();
  y += 20;

  // Lines
  const descWidth = W - PAD * 2 - 240;
  for (const g of sheet.groups) {
    if (g.option) {
      text(g.option.toUpperCase(), PAD, 24, BLUE, 700);
      y += 40;
    }
    for (const l of g.lines) {
      const top = y;
      lines(l.description, PAD, descWidth, 30, INK, 600);
      lines(l.detail, PAD, descWidth, 25, DIM, 400);
      const end = y;
      y = top;
      text(l.amount, W - PAD, 30, INK, 600, "right");
      y = end + 14;
      rule();
      y += 20;
    }
  }

  // Total
  y += 6;
  const totalTop = y;
  ops.push((ctx, top) => {
    ctx.fillStyle = "#eef1fb";
    ctx.fillRect(PAD, top + totalTop - 18, W - PAD * 2, 92);
  });
  y += 6;
  text("Total payout", PAD + 24, 32, INK, 700);
  text(sheet.total, W - PAD - 24, 40, BLUE, 800, "right");
  y = totalTop + 100;

  if (sheet.note) {
    y += 10;
    text("Note", PAD, 24, DIM, 600);
    y += 36;
    lines(sheet.note, PAD, W - PAD * 2, 27, INK);
  }
  y += 24;
  lines(sheet.footer, PAD, W - PAD * 2, 23, DIM);
  y += PAD - 20;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.max(Math.ceil(y), 600);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const op of ops) op(ctx, 0);
  return canvas;
}

/** The picture as a JPEG, base64 without the data: prefix, for the push. */
export function cardJpeg(sheet: CardSheet): { base64: string; dataUrl: string } {
  const dataUrl = drawCard(sheet).toDataURL("image/jpeg", 0.9);
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), dataUrl };
}
