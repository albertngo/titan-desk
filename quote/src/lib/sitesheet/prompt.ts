/**
 * What Claude is told when it reads photos of the stair site sheet (v5), and the JSON schema its answer
 * follows, written into the message itself (see SHEET_PROMPT below). Pure data: src/lib/quotes/sitesheet.ts sends it,
 * src/lib/sitesheet/sheet.ts cleans the answer. The schema mirrors SiteSheet; cleanSheet() still checks
 * every value, so a wrong answer can't get in.
 */

const INSTRUCTIONS = `You are reading photos of Titan Flooring's "Stair Site Sheet" (v5, two Letter pages), filled in by hand on site by a project manager. Read exactly what is written or marked. Never guess and never fill in a typical value: a box left blank is null.

How the sheet is marked:
- Round bubbles and square ticks are chosen when filled, ticked, crossed or circled. An empty bubble is not chosen.
- Numbers are written in boxes or on lines. A crossed-out number is replaced by the one written beside it.
- Count boxes in B1–B8 may hold several numbers, because the PM counts a staircase in parts (e.g. "4 + 3", "4 3", or numbers stacked in the box): add them up and return the total as one number. A number on its own is itself. The "at __" width in Other width is never added.
- Each field has a small code printed beside it (A1, B6, F3 …). Use the codes to find fields.

Page 1:
- Header: Quote Q-number boxes (return like "Q-1234"), Customer, Date, PM.
- A1 Where (tick all): Main, Basement, Townhome, Side / half staircase (return "Side").
- A2 Main shape: one of the eight drawings: Straight, Quarter turn, Quarter winder, U landing ("U, landing"), Curved, Spiral, Double winder, Half landing.
- A3 On the steps now: Carpet, Wood caps, Painted wood, Vinyl, Other.
- B1–B4 Treads grid: rows RSO (rso), LSO (lso), Boxed (boxed), 2 side open (two); columns 36", 42", 48", Other width. A number in "Other width" goes in "other"; if the width itself is written (e.g. "40") put it in otherWidth.
- B5 Tread depth: standard 10-5/8" → 0; custom → the inches written.
- B6 Pie shape: counts under LSO / RSO / 2 side open (Boxed is shaded; there is no turn box).
- B7 Pizza set: under Pizza only, how many 2-piece sets (pizza.pc2, the "2-pc" box) and how many 3-piece sets (pizza.pc3, the "3-pc" box); under 2 side open, how many of those sets are 2 side open (pizza.two; they are already in the 2-pc / 3-pc counts, not extra). Blank → null. On an older print with one "sets" box, 2-pc / 3-pc bubbles and a 2-side-open tick: the sets go in pc2 when 2-pc is chosen, else pc3, and also in two when the tick is marked.
- B8 Bullnose: counts under LSO / RSO / 2 side open (Boxed and Type are shaded).
- B9 Total treads.
- B10 Side / half staircase: steps, its tread type (RSO/LSO/Boxed/2 side open → rso/lso/boxed/two), width.
- C1 Landings: how many at 3×3 (s3x3), ≈3×6 (s3x6), Other (other). C2 Half moons: how many, nosing feet, and solid=true only if "Solid one-piece" is ticked (beside "Nosing method (default)").
- D1 Stringers now: White, Stained, Other. D2 Made of: Veneer, Solid, Don't know (blank stays null).

Page 2:
- E1 Nosing default for the staircase (nosingDefault): carpet true when "Carpet on the nosings now" is ticked; thickness ½" → "1/2", ¾" → "3/4", Not sure → "unsure"; depth: blank or Standard 4.5" → null, else the inches written.
- E2 Nosing pieces, columns 1–10, one piece each: Length (ft); Depth if different (inches, blank → null); Thickness if different (½ → "1/2", ¾ → "3/4", blank → null); Sand instead of new (ticked → sand true). Return only columns with something in them, in column order.
- F1 Railing runs, columns 1–8, one run each: Length (ft); Where S (on steps) / F (flat) / W (wall) → "S" / "F" / "W"; Curved ticked → curved true; Pickets ticked → pickets true, and if feet are written there instead of (or beside) the tick, put them in picketFt. Return only columns with something in them.
- metalBar true when "Metal bar under the handrail" is ticked (one tick for the staircase).
- F2 Spindles counted (optional): On the steps, Flat top. F3 Picket heights (optional): counts at 36", 39", 42". F4 Posts: There now, To add.
- G What the customer wants:
  - G1 Treads (tick all): Sand & refinish existing caps → "sand", New wood caps → "caps", Vinyl treads → "vinylTreads", Vinyl steps → "vinylSteps", Not sure → "unsure". squareBullnose true when "Square off bullnose" is ticked.
  - G2 Riser colour: White / Stain / Not sure → white / stain / unsure.
  - G3 Stringer colour: White / Stain / Not sure → white / stain / unsure.
  - G4 Stain colour (text), and matchFloors true when "Match floors" is chosen.
  - G5 Handrail: Keep & refinish → refinish, New → new. If "Add wall rail" has feet written, put them in wallRailFt.
  - G6 Spindles: keep / iron / wood. G7 Posts: keep / refinish / new. G8 Covers: main / both.
- N1 Notes: copy the handwriting as written.

If you are not confident about a value (smudged, ambiguous, two marks), give your best reading and add its code (like "B6" or "F1") to "unclear". If a whole page is missing from the photos, leave its fields null and add "page 1 missing" or "page 2 missing" to notes. Answer with one JSON object and nothing else, following the JSON Schema at the end of these instructions.`;

const N = { type: ["number", "null"] };
const S = { type: ["string", "null"] };
const widths = { type: "object", properties: { w36: N, w42: N, w48: N, other: N, otherWidth: N } };
const sides = { type: "object", properties: { lso: N, rso: N, two: N } };
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
    pizza: { type: "object", properties: { two: N, pc2: N, pc3: N } },
    bullnose: sides,
    totalTreads: N,
    side: { type: "object", properties: { steps: N, type: choice(["rso", "lso", "boxed", "two"]), width: N } },
    landings: { type: "object", properties: { s3x3: N, s3x6: N, other: N } },
    halfMoons: { type: "object", properties: { count: N, nosingFt: N, solid: { type: "boolean" } } },
    stringers: { type: "object", properties: { now: choice(["White", "Stained", "Other"]), made: choice(["Veneer", "Solid", "Don't know"]) } },
    nosingDefault: { type: "object", properties: { carpet: { type: "boolean" }, thickness: choice(["1/2", "3/4", "unsure"]), depth: N } },
    nosings: { type: "array", maxItems: 10, items: { type: "object", properties: { ft: N, depth: N, thickness: choice(["1/2", "3/4"]), sand: { type: "boolean" } } } },
    runs: { type: "array", maxItems: 8, items: { type: "object", properties: { ft: N, where: choice(["S", "F", "W"]), curved: { type: "boolean" }, pickets: { type: "boolean" }, picketFt: N } } },
    metalBar: { type: "boolean" },
    spindles: { type: "object", properties: { onSteps: N, flatTop: N } },
    heights: { type: "object", properties: { h36: N, h39: N, h42: N } },
    posts: { type: "object", properties: { now: N, add: N } },
    want: {
      type: "object",
      properties: {
        treads: { type: "array", items: { type: "string", enum: ["sand", "caps", "vinylTreads", "vinylSteps", "unsure"] } },
        riser: choice(["white", "stain", "unsure"]),
        stringer: choice(["white", "stain", "unsure"]),
        squareBullnose: { type: "boolean" },
        stain: S,
        matchFloors: { type: "boolean" },
        handrail: choice(["refinish", "new"]),
        wallRailFt: N,
        spindles: choice(["keep", "iron", "wood"]),
        posts: choice(["keep", "refinish", "new"]),
        covers: choice(["main", "both"]),
      },
    },
    notes: S,
    unclear: { type: "array", items: { type: "string" } },
  },
};

/**
 * The whole message: the instructions, then the schema as text. The schema goes in the prompt rather than in
 * the request's structured-output setting (2026-10-28): that setting refused this sheet three ways in a row
 * (a type list beside an enum, then too many nullable fields: 70 against its limit), and cleanSheet() checks
 * every value anyway, so nothing the answer holds can get past it.
 */
export const SHEET_PROMPT = `${INSTRUCTIONS}

JSON Schema of the answer (null for a blank box; leave out nothing):
${JSON.stringify(SHEET_SCHEMA)}`;
