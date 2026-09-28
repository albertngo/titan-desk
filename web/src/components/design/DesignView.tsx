"use client";

import { useEffect, useMemo, useState } from "react";
import { BlurImage } from "@/components/BlurImage";
import { Card, Field, Multi, NumberInput, Segmented, Toggle } from "@/components/design/Controls";
import { PickCard } from "@/components/design/PickCard";
import { getDesignCandidates, getDesignDictionary, getDesignRules } from "@/lib/db/queries";
import { matchPhrases } from "@/lib/design/dictionary";
import { buildProfile, EMPTY_ANSWERS, PAIRS, type Answers, type PairChoice, type PairKey } from "@/lib/design/profile";
import { recommend } from "@/lib/design/recommend";
import { LOOK_ALIKES, REAL_WOOD, type Candidate, type DesignRule, type DictionaryRow, type Room } from "@/lib/design/types";
import { supabaseBrowser } from "@/lib/supabase/client";

const ROOMS: Room[] = ["Kitchen", "Bathroom", "Laundry", "Living room", "Bedroom", "Hallway", "Basement", "Stairs", "Whole floor"];

type Material = "wood" | "lookalike" | "any";

function materialOf(a: Answers): Material {
  const c = a.hard.categories_allowed;
  if (!c) return "any";
  return c.every((x) => (REAL_WOOD as readonly string[]).includes(x)) ? "wood" : "lookalike";
}

function categoriesFor(m: Material | null): string[] | null {
  if (m === "wood") return [...REAL_WOOD];
  if (m === "lookalike") return [...REAL_WOOD, ...LOOK_ALIKES];
  return null;
}

/** A floor that shows the pair option well (tagged, with a photo), for the forced-choice swatches. */
function exampleFloor(floors: Candidate[], key: PairKey, value: string): Candidate | undefined {
  const test: Record<PairKey, (f: Candidate) => boolean> = {
    undertone: (f) => f.undertone === value,
    tone: (f) => f.tone_depth !== null && (value === "light" ? f.tone_depth <= 2 : f.tone_depth >= 4),
    busyness: (f) => f.busyness === value,
    texture: (f) => f.texture !== null && (value === "Smooth" ? f.texture === "Smooth" : f.texture !== "Smooth"),
  };
  return floors.find((f) => f.hero?.thumb && test[key](f));
}

export function DesignView() {
  const supabase = supabaseBrowser();
  const [dictionary, setDictionary] = useState<DictionaryRow[]>([]);
  const [rules, setRules] = useState<DesignRule[]>([]);
  const [floors, setFloors] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [a, setA] = useState<Answers>(EMPTY_ANSWERS);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    Promise.all([getDesignDictionary(supabase), getDesignRules(supabase), getDesignCandidates(supabase)])
      .then(([d, r, f]) => { setDictionary(d); setRules(r); setFloors(f); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [supabase]);

  const profile = useMemo(() => buildProfile(a, dictionary), [a, dictionary]);
  const rec = useMemo(() => (floors ? recommend(floors, profile, rules) : null), [floors, profile, rules]);
  const heard = useMemo(
    () => [...matchPhrases(a.said.like, dictionary), ...matchPhrases(a.said.dislike, dictionary)],
    [a.said, dictionary],
  );

  // setters
  const hard = (patch: Partial<Answers["hard"]>) => setA((x) => ({ ...x, hard: { ...x.hard, ...patch } }));
  const space = (patch: Partial<Answers["space"]>) => setA((x) => ({ ...x, space: { ...x.space, ...patch } }));
  const living = (patch: Partial<Answers["living"]>) => setA((x) => ({ ...x, living: { ...x.living, ...patch } }));
  const fixed = (patch: Partial<Answers["fixed"]>) => setA((x) => ({ ...x, fixed: { ...x.fixed, ...patch } }));
  const said = (patch: Partial<Answers["said"]>) => setA((x) => ({ ...x, said: { ...x.said, ...patch }, removed: [] }));
  const pair = (key: PairKey, value: string | null) =>
    setA((x) => ({ ...x, pairs: { ...x.pairs, [key]: value ?? undefined } as PairChoice }));

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Help me choose</h1>
        <button type="button" className="text-xs text-zinc-500 underline" onClick={() => { setA(EMPTY_ANSWERS); setShowMore(false); }}>
          Start over
        </button>
      </div>

      <Card title="The space" hint="The must-haves. These rule floors in or out.">
        <Field label="Which rooms?"><Multi value={a.hard.rooms} options={ROOMS} onChange={(rooms) => hard({ rooms })} /></Field>
        <Field label="Level">
          <Segmented value={a.hard.level} onChange={(level) => hard({ level })}
            options={[{ value: "basement", label: "Basement" }, { value: "main", label: "Main" }, { value: "upper", label: "Upper" }]} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          <Toggle label="Condo" value={a.hard.condo} onChange={(condo) => hard({ condo })} />
          <Toggle label="Radiant heat" value={a.hard.radiant_heat} onChange={(radiant_heat) => hard({ radiant_heat })} />
          <Toggle label="Open plan" value={a.space.open_plan} onChange={(open_plan) => space({ open_plan })} />
        </div>
        {a.hard.condo && (
          <Field label="Building's IIC minimum (blank if unknown — 72 assumed)">
            <NumberInput value={a.hard.min_iic} onChange={(min_iic) => hard({ min_iic })} placeholder="72" />
          </Field>
        )}
        {a.hard.rooms.some((r) => r === "Kitchen" || r === "Bathroom" || r === "Laundry") && (
          <Toggle label="Client accepts real wood in the wet room" value={a.hard.accepts_wood_in_wet_rooms}
            onChange={(accepts_wood_in_wet_rooms) => hard({ accepts_wood_in_wet_rooms })} />
        )}
        <Field label="Room size">
          <Segmented value={a.space.size} onChange={(size) => space({ size })}
            options={[{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }]} />
        </Field>
        <Field label="Natural light">
          <Segmented value={a.space.light} onChange={(light) => space({ light })}
            options={[{ value: "bright", label: "Bright" }, { value: "average", label: "Average" }, { value: "low", label: "Low / north-facing" }]} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          <Toggle label="Strong direct sun" value={a.space.heavy_sun} onChange={(heavy_sun) => space({ heavy_sun })} />
        </div>
        <Field label="Layout">
          <Segmented value={a.space.pattern} onChange={(pattern) => space({ pattern })}
            options={[{ value: "none", label: "Straight planks" }, { value: "herringbone", label: "Herringbone" }, { value: "chevron", label: "Chevron" }]} />
        </Field>
        <Field label="Height limit (thickness, mm)">
          <NumberInput value={a.hard.max_thickness_mm} onChange={(max_thickness_mm) => hard({ max_thickness_mm })} placeholder="none" suffix="mm" />
        </Field>
      </Card>

      <Card title="How it's lived in">
        <div className="flex flex-wrap gap-1.5">
          <Toggle label="Pets" value={a.living.pets} onChange={(pets) => living({ pets })} />
          <Toggle label="Kids / high traffic" value={a.living.high_traffic} onChange={(high_traffic) => living({ high_traffic })} />
          <Toggle label="Selling in a few years" value={a.living.resale} onChange={(resale) => living({ resale })} />
        </div>
      </Card>

      <Card title="What's staying" hint="The floor has to live with these.">
        <Field label="Cabinets">
          <Segmented value={a.fixed.cabinets} onChange={(cabinets) => fixed({ cabinets, cabinet_tone: cabinets === "wood" ? a.fixed.cabinet_tone : null })}
            options={[{ value: "wood", label: "Wood" }, { value: "painted_white", label: "Painted white" }, { value: "painted_colour", label: "Painted colour" }, { value: "none", label: "None" }]} />
        </Field>
        {a.fixed.cabinets === "wood" && (
          <Field label="How light or dark are the wood cabinets? (1 lightest – 5 darkest)">
            <Segmented value={a.fixed.cabinet_tone} onChange={(cabinet_tone) => fixed({ cabinet_tone })}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
          </Field>
        )}
        <Field label="Counters, walls and trim feel…">
          <Segmented value={a.fixed.fixed_undertone} onChange={(fixed_undertone) => fixed({ fixed_undertone })}
            options={[{ value: "Warm", label: "Warm" }, { value: "Neutral", label: "Neutral" }, { value: "Cool", label: "Cool / grey" }]} />
        </Field>
      </Card>

      <Card title="Taste" hint="Their words, as they said them. Tap a chip to drop a match that's wrong.">
        <Field label="Describe the feel in a few words">
          <textarea className="w-full rounded-lg border border-zinc-300 p-2 text-sm" rows={2} placeholder="warm and cozy, not too modern…"
            value={a.said.like} onChange={(e) => said({ like: e.target.value })} />
        </Field>
        <Field label="What don't they want?">
          <textarea className="w-full rounded-lg border border-zinc-300 p-2 text-sm" rows={2} placeholder="too grey, too busy…"
            value={a.said.dislike} onChange={(e) => said({ dislike: e.target.value })} />
        </Field>
        {profile.prefs.filter((p) => p.source === "said").length + a.removed.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.prefs.filter((p) => p.source === "said").map((p) => (
              <button key={p.id} type="button" onClick={() => setA((x) => ({ ...x, removed: [...x.removed, p.id] }))}
                className={`rounded-full px-2.5 py-1 text-xs ${p.kind === "avoid" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                {p.kind === "avoid" ? "✕ " : ""}{p.label} ×
              </button>
            ))}
            {a.removed.length > 0 && (
              <button type="button" className="text-xs text-zinc-500 underline" onClick={() => setA((x) => ({ ...x, removed: [] }))}>undo</button>
            )}
          </div>
        )}
        {heard.length === 0 && (a.said.like || a.said.dislike) && (
          <p className="text-xs text-zinc-500">No phrase in the Design Dictionary matched those words yet — try the pairs below, or add the phrase to the Dictionary in Airtable.</p>
        )}
        {profile.prefs.some((p) => p.also) && (
          <ul className="space-y-0.5 text-xs text-zinc-600">
            {profile.prefs.filter((p) => p.also).map((p) => <li key={p.id}>{p.label}: {p.also}</li>)}
          </ul>
        )}
        <p className="pt-1 text-xs font-medium text-zinc-600">Not sure? Which would they rather live with?</p>
        {PAIRS.map((pq) => (
          <Field key={pq.key} label={pq.question}>
            <div className="grid grid-cols-2 gap-2">
              {[pq.a, pq.b].map((opt) => {
                const on = a.pairs[pq.key] === opt.value;
                const ex = floors ? exampleFloor(floors, pq.key, opt.value) : undefined;
                return (
                  <button key={opt.value} type="button" aria-pressed={on} onClick={() => pair(pq.key, on ? null : opt.value)}
                    className={`overflow-hidden rounded-lg border text-left text-sm ${on ? "border-zinc-900 ring-2 ring-zinc-900" : "border-zinc-300"}`}>
                    {ex?.hero?.thumb && (
                      <span className="relative block aspect-[4/3] bg-zinc-100">
                        <BlurImage src={ex.hero.thumb} blurhash={ex.hero.blurhash} alt={ex.product_name ?? ex.sku} sizes="50vw" />
                      </span>
                    )}
                    <span className="block px-2 py-1.5">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        ))}
      </Card>

      <Card title="Budget and material">
        <Field label="Material budget">
          <NumberInput value={a.hard.budget_ceiling_sf} onChange={(budget_ceiling_sf) => hard({ budget_ceiling_sf })} placeholder="any" prefix="$" suffix="/sf" />
        </Field>
        <Field label="Real wood, or is a look-alike fine?">
          <Segmented value={materialOf(a)} onChange={(m) => hard({ categories_allowed: categoriesFor(m) })}
            options={[{ value: "wood", label: "Real wood only" }, { value: "lookalike", label: "Wood or a look-alike" }, { value: "any", label: "Anything (incl. tile)" }]} />
        </Field>
      </Card>

      <section className="space-y-3 pt-2">
        <h2 className="text-base font-semibold">Picks</h2>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Couldn&apos;t load: {error}</p>}
        {!rec && !error && <p className="text-sm text-zinc-500">Loading the catalogue…</p>}
        {rec && (
          <>
            <p className="text-xs text-zinc-500">
              {rec.pool} floors fit the job; {rec.tagged_in_pool} of them are style-tagged, so taste is judged on those.
              {rec.excluded_by_safety > 0 && ` ${rec.excluded_by_safety} ruled out for safety.`}
            </p>
            {[...rec.relaxed, ...rec.unconfirmed, ...rec.open_questions].length > 0 && (
              <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                {rec.relaxed.map((x) => <li key={x}>↔ {x}</li>)}
                {rec.unconfirmed.map((x) => <li key={x}>⚠ {x}</li>)}
                {rec.open_questions.map((x) => <li key={x}>? {x}</li>)}
              </ul>
            )}
            {rec.picks.length === 0 && <p className="text-sm text-zinc-600">Nothing fits yet — loosen the must-haves above.</p>}
            {rec.picks.map((p) => <PickCard key={p.floor.sku} pick={p} role={p.role} />)}
            {rec.more.length > 0 && (
              <div>
                <button type="button" className="text-sm text-zinc-700 underline" onClick={() => setShowMore((v) => !v)}>
                  {showMore ? "Hide" : `Show ${rec.more.length} more`}
                </button>
                {showMore && <div className="mt-2 space-y-3">{rec.more.map((p) => <PickCard key={p.floor.sku} pick={p} />)}</div>}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
