import { BASE_HOW, BASE_PIECE, DISPOSALS, FLOORS, LEVEL_CODES, MATERIALS, MEASURED_WITH, NAILS, NOW, SUBFLOOR_SHEETS } from "./sheet";

/**
 * What Claude is told when it reads a photo of the Flooring Site Sheet (v1, 2026-11-03), and the JSON schema its
 * answer follows, written into the message (the same way as the stair sheet's prompt, src/lib/sitesheet/prompt.ts:
 * the structured-output setting refuses this many nullable fields, and cleanFloorSheet() checks every value anyway).
 * Pure data: src/lib/quotes/sitesheet.ts sends it.
 */

const INSTRUCTIONS = `You are reading a photo of Titan Flooring's "Flooring Site Sheet" (v1, one Letter page), filled in by hand on site by a project manager. Read exactly what is written or marked. Never guess and never fill in a typical value: a box left blank is null (or false for a tick, [] for a list).

How the sheet is marked:
- Round bubbles and square ticks are chosen when filled, ticked, crossed or circled. An empty bubble is not chosen.
- A crossed-out number is replaced by the one written beside it.
- Each field has a small code printed beside it (R0, R5, W3 …). Use the codes to find fields.
- The PM never adds anything up. Never add rooms together; copy each row as written.

Header: Quote Q-number boxes (return like "Q-1234"), Customer, Date, PM.

R ROOMS:
- R0 Measured with: Laser, Moasure or Tape (one).
- R1–R12, one row a room. Return only rows with something written or ticked, in order. For each row:
  - name: the Room as written.
  - level: the Level bubble B, M or U.
  - sqft: the Sq ft number. linearFt: the Linear ft number.
  - now: the Floor there now bubble: Carpet → "carpet", Lam/Vin → "lamvin", Wood → "wood", Tile/ply → "tilePly", Tile/conc → "tileConc".
  - remove: true only when the Remove square is ticked.
  - floors: the New floor bubbles in the last column: [1], [2], [1, 2] when both are filled, [] when neither.

W WHAT THE CUSTOMER WANTS, two columns, Floor 1 (left) then Floor 2 (right); return both in "want", Floor 1 first, all null when a column is blank:
- W1 New floor (one bubble): Vinyl click → "vinylClick", Waterproof laminate → "wpLaminate", Engineered click → "engClick", Engineered ¾" → "eng34", Solid hardwood → "solid", Porcelain tile → "tile", Herringbone vinyl → "hbVinyl", Herringbone engineered → "hbEng", Sand & stain existing → "sand", Buff & polish only → "buff".
- Nailed wood (under W1): Nail down → "nail", Nail + glue → "nailGlue".
- W2 Material: Standard → "standard", Customer supplies → "customer"; sku: the SKU written on the "or SKU" line, exactly as written (letters, digits and dashes).
- W3 Baseboards: None / Reinstall existing / New → "none" / "reinstall" / "new"; then Baseboard / Shoe / Both → "baseboard" / "shoe" / "both".
- W4 Subfloor: screw true when Screw-down is ticked; sheet: ¾" ply → "ply34", ¾" OSB → "osb34", ½" ply → "ply12", ½" OSB → "osb12"; sqft: the sq ft written beside it (blank → null).
- W5 Disposal: General (bin / takeaway) → "general", Condo / apartment → "condo", Large (2 bins) → "large".
- N2 Notes: copy the handwriting as written.

If you are not confident about a value (smudged, ambiguous, two marks), give your best reading and add its code (like "R3" or "W2") to "unclear". If the photo is not this sheet (a stair sheet, another form, a room), return every field null or empty and put "not the flooring sheet" in notes. Answer with one JSON object and nothing else, following the JSON Schema at the end of these instructions.`;

const N = { type: ["number", "null"] };
const S = { type: ["string", "null"] };
const choice = (values: readonly string[]) => ({ type: ["string", "null"], enum: [...values, null] });
const want = { type: "object", properties: { floor: choice(FLOORS), nail: choice(NAILS), material: choice(MATERIALS), sku: S } };

export const FLOOR_SCHEMA = {
  type: "object",
  properties: {
    quoteNumber: S,
    customer: S,
    date: S,
    pm: S,
    measuredWith: choice(MEASURED_WITH),
    rooms: {
      type: "array",
      maxItems: 12,
      items: { type: "object", properties: { name: S, level: choice(LEVEL_CODES), sqft: N, linearFt: N, now: choice(NOW), remove: { type: "boolean" }, floors: { type: "array", items: { type: "number", enum: [1, 2] } } } },
    },
    want: { type: "array", minItems: 2, maxItems: 2, items: want },
    baseboards: { type: "object", properties: { how: choice(BASE_HOW), piece: choice(BASE_PIECE) } },
    subfloor: { type: "object", properties: { screw: { type: "boolean" }, sheet: choice(SUBFLOOR_SHEETS), sqft: N } },
    disposal: choice(DISPOSALS),
    notes: S,
    unclear: { type: "array", items: { type: "string" } },
  },
};

export const FLOOR_PROMPT = `${INSTRUCTIONS}

JSON Schema of the answer (null for a blank box; leave out nothing):
${JSON.stringify(FLOOR_SCHEMA)}`;
