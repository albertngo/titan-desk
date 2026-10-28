/**
 * What Claude is told when it reads photos of the stair site sheet (v3), and the one tool it must answer
 * with. Pure data: src/lib/quotes/sitesheet.ts sends it, src/lib/sitesheet/sheet.ts cleans the answer.
 * The schema mirrors SiteSheet; cleanSheet() still checks every value, so a wrong answer can't get in.
 */

export const SHEET_TOOL = "record_sheet";

export const SHEET_PROMPT = `You are reading photos of Titan Flooring's "Stair Site Sheet" (v4, two Letter pages), filled in by hand on site by a project manager. Read exactly what is written or marked. Never guess and never fill in a typical value: a box left blank is null.

How the sheet is marked:
- Round bubbles and square ticks are chosen when filled, ticked, crossed or circled. An empty bubble is not chosen.
- Numbers are written in boxes or on lines. A crossed-out number is replaced by the one written beside it.
- Each field has a small code printed beside it (A1, B6, F3 …). Use the codes to find fields.

Page 1:
- Header: Quote Q-number boxes (return like "Q-1234"), Customer, Date, PM.
- A1 Where (tick all): Main, Basement, Townhome, Side / half staircase (return "Side").
- A2 Main shape: one of the eight drawings: Straight, Quarter turn, Quarter winder, U landing ("U, landing"), Curved, Spiral, Double winder, Half landing.
- A3 On the steps now: Carpet, Wood caps, Painted wood, Vinyl, Other.
- B1–B4 Treads grid: rows RSO (rso), LSO (lso), Boxed (boxed), 2 side open (two); columns 36", 42", 48", Other width. A number in "Other width" goes in "other"; if the width itself is written (e.g. "40") put it in otherWidth.
- B5 Tread depth: standard 10-5/8" → 0; custom → the inches written.
- B6 Pie shape, B7 Pizza set, B8 Bullnose: columns Boxed / LSO / RSO / 2 side open (bullnose has no Boxed). Pie and pizza have a turn L or R; pizza 2-pc or 3-pc; bullnose Standard or Custom (bullnoseCustom true when Custom).
- B9 Total treads.
- B10 Side / half staircase: steps, its tread type (RSO/LSO/Boxed/2 side open → rso/lso/boxed/two), width.
- C1 Landings: how many at 3×3 (s3x3), ≈3×6 (s3x6), Other (other). C2 Half moons: how many, nosing feet, and solid=true only if "Solid one-piece" is chosen.
- D1 Stringers now: White, Coloured, Other. D2 Made of: Veneer, Solid, Don't know (blank stays null).

Page 2:
- E1 Nosing default for the staircase (nosingDefault): Nosing now Hardwood / Laminate / Vinyl / Carpet (type); thickness ½" → "1/2", ¾" → "3/4", Not sure → "unsure"; depth: blank or Standard 4.5" → null, else the inches written.
- E2 Nosing pieces, columns 1–10, one piece each: Length (ft); "If different" (a type and/or thickness written for that piece only, e.g. "L ½" → type Laminate, thickness "1/2"; blank → both null); Sand instead of new (ticked → sand true). Return only columns with something in them, in column order.
- F1 Railing runs, columns 1–8, one run each: Length (ft); Where S (on steps) / F (flat) / W (wall) → "S" / "F" / "W"; Curved ticked → curved true; Pickets ticked → pickets true, and if feet are written there instead of (or beside) the tick, put them in picketFt. Return only columns with something in them. Brackets (count) under the grid → brackets.
- F2 Spindles counted (optional): On the steps, Flat top. F3 Picket heights (optional): counts at 36", 39", 42". F4 Posts: There now, To add.
- G What the customer wants:
  - G1 Treads (tick all): Sand & refinish existing caps → "sand", New wood caps → "caps", Vinyl → "vinyl", Not sure → "unsure".
  - G2 Riser colour: white / stain / unsure.
  - G3 Stringer colour: white / coloured / unsure.
  - G4 Stain colour (text), and matchFloors true when "Match floors" is chosen.
  - G5 Handrail: refinish / new / complex. If "Add wall rail" has feet written, put them in wallRailFt.
  - G6 Spindles: keep / iron / wood. G7 Posts: keep / refinish / new. G8 Covers: main / both.
- N1 Notes: copy the handwriting as written.

If you are not confident about a value (smudged, ambiguous, two marks), give your best reading and add its code (like "B6" or "F1") to "unclear". If a whole page is missing from the photos, leave its fields null and add "page 1 missing" or "page 2 missing" to notes. Call ${SHEET_TOOL} exactly once.`;

const N = { type: ["number", "null"] };
const S = { type: ["string", "null"] };
const B = { type: ["boolean", "null"] };
const widths = { type: "object", properties: { w36: N, w42: N, w48: N, other: N, otherWidth: N } };
const sides = { type: "object", properties: { boxed: N, lso: N, rso: N, two: N } };
const choice = (values: string[]) => ({ type: ["string", "null"], enum: [...values, null] });

export const SHEET_SCHEMA = {
  type: "object",
  properties: {
    quoteNumber: S,
    customer: S,
    date: S,
    pm: S,
    where: { type: "array", items: { type: "string", enum: ["Main", "Basement", "Townhome", "Side"] } },
    shape: choice(["Straight", "Quarter turn", "Quarter winder", "U landing", "Curved", "Spiral", "Double winder", "Half landing"]),
    onSteps: choice(["Carpet", "Wood caps", "Painted wood", "Vinyl", "Other"]),
    treads: { type: "object", properties: { rso: widths, lso: widths, boxed: widths, two: widths } },
    treadDepth: N,
    pie: sides,
    pieTurn: choice(["L", "R"]),
    pizza: sides,
    pizzaTurn: choice(["L", "R"]),
    pizzaPieces: { type: ["number", "null"], enum: [2, 3, null] },
    bullnose: { type: "object", properties: { lso: N, rso: N, two: N } },
    bullnoseCustom: B,
    totalTreads: N,
    side: { type: "object", properties: { steps: N, type: choice(["rso", "lso", "boxed", "two"]), width: N } },
    landings: { type: "object", properties: { s3x3: N, s3x6: N, other: N } },
    halfMoons: { type: "object", properties: { count: N, nosingFt: N, solid: { type: "boolean" } } },
    stringers: { type: "object", properties: { now: choice(["White", "Coloured", "Other"]), made: choice(["Veneer", "Solid", "Don't know"]) } },
    nosingDefault: { type: "object", properties: { type: choice(["Hardwood", "Laminate", "Vinyl", "Carpet"]), thickness: choice(["1/2", "3/4", "unsure"]), depth: N } },
    nosings: { type: "array", maxItems: 10, items: { type: "object", properties: { ft: N, type: choice(["Hardwood", "Laminate", "Vinyl", "Carpet"]), thickness: choice(["1/2", "3/4", "unsure"]), sand: { type: "boolean" } } } },
    runs: { type: "array", maxItems: 8, items: { type: "object", properties: { ft: N, where: choice(["S", "F", "W"]), curved: { type: "boolean" }, pickets: { type: "boolean" }, picketFt: N } } },
    brackets: N,
    spindles: { type: "object", properties: { onSteps: N, flatTop: N } },
    heights: { type: "object", properties: { h36: N, h39: N, h42: N } },
    posts: { type: "object", properties: { now: N, add: N } },
    want: {
      type: "object",
      properties: {
        treads: { type: "array", items: { type: "string", enum: ["sand", "caps", "vinyl", "unsure"] } },
        riser: choice(["white", "stain", "unsure"]),
        stringer: choice(["white", "coloured", "unsure"]),
        stain: S,
        matchFloors: { type: "boolean" },
        handrail: choice(["refinish", "new", "complex"]),
        wallRailFt: N,
        spindles: choice(["keep", "iron", "wood"]),
        posts: choice(["keep", "refinish", "new"]),
        covers: choice(["main", "both"]),
      },
    },
    notes: S,
    unclear: { type: "array", items: { type: "string" } },
  },
  required: ["where", "treads", "want", "unclear"],
} as const;
