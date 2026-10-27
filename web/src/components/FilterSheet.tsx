"use client";

import { EMPTY_FILTERS, type Filters } from "@/lib/db/filters";
import type { Facets } from "@/lib/db/queries";

type ListKey = "supplier" | "category" | "undertone" | "texture" | "style" | "busyness";

function Checks({ label, facet, values, selected, onToggle }: {
  label: string; facet: ListKey; values: { value: string; n: number }[]; selected: string[]; onToggle: (k: ListKey, v: string) => void;
}) {
  if (!values.length) return null;
  return (
    <fieldset className="mt-6">
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map(({ value, n }) => {
          const on = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(facet, value)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${on ? "bg-denim text-cream" : "bg-white text-ink ring-1 ring-denim/15 hover:ring-denim/40"}`}
            >
              {value} <span className="opacity-60">{n}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FilterSheet({ filters, facets, onChange, onClose }: {
  filters: Filters; facets: Facets | null; onChange: (f: Filters) => void; onClose: () => void;
}) {
  const toggle = (k: ListKey, v: string) => {
    const cur = filters[k];
    onChange({ ...filters, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const bool = (k: "waterproof" | "radiant" | "pet" | "hide") => (
    <label className="flex items-center gap-2.5 py-1.5 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-denim" checked={filters[k]} onChange={(e) => onChange({ ...filters, [k]: e.target.checked })} />
      {{ waterproof: "Waterproof", radiant: "Radiant heat compatible", pet: "Pet friendly", hide: "Hide special order / discontinued / coming soon" }[k]}
    </label>
  );
  const numInput = (k: "min" | "max" | "tone_min" | "tone_max", placeholder: string, step = "0.01") => (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      placeholder={placeholder}
      value={filters[k] ?? ""}
      onChange={(e) => onChange({ ...filters, [k]: e.target.value === "" ? null : Number(e.target.value) })}
      className="w-24 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-denim/15 outline-none focus:ring-2 focus:ring-denim"
    />
  );

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 md:items-stretch md:justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label="Filters">
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-cream p-5 pb-10 md:max-h-none md:w-[440px] md:rounded-none md:p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-denim">Filters</h2>
          <div className="flex gap-2">
            <button type="button" className="rounded-full px-3 py-2 text-sm font-medium text-denim hover:bg-white" onClick={() => onChange({ ...EMPTY_FILTERS, q: filters.q, by: filters.by })}>Clear all</button>
            <button type="button" className="rounded-full bg-denim px-5 py-2 text-sm font-semibold text-cream hover:bg-denim-dark" onClick={onClose}>Done</button>
          </div>
        </div>

        <Checks label="Supplier" facet="supplier" values={facets?.supplier ?? []} selected={filters.supplier} onToggle={toggle} />
        <Checks label="Category" facet="category" values={facets?.category ?? []} selected={filters.category} onToggle={toggle} />

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-ink">Price per sq ft</legend>
          <div className="mt-1 flex items-center gap-2">{numInput("min", "min")} <span className="text-ink/40">to</span> {numInput("max", "max")}</div>
          <p className="mt-1 text-xs text-ink/55">Per-piece items (accessories, stone) are excluded when a range is set.</p>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-ink">Suitability</legend>
          {bool("waterproof")}{bool("radiant")}{bool("pet")}{bool("hide")}
        </fieldset>

        <Checks label="Undertone" facet="undertone" values={facets?.undertone ?? []} selected={filters.undertone} onToggle={toggle} />
        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-ink">Tone depth (1 very light – 5 very dark)</legend>
          <div className="mt-1 flex items-center gap-2">{numInput("tone_min", "1", "1")} <span className="text-ink/40">to</span> {numInput("tone_max", "5", "1")}</div>
        </fieldset>
        <Checks label="Texture" facet="texture" values={facets?.texture ?? []} selected={filters.texture} onToggle={toggle} />
        <Checks label="Style" facet="style" values={facets?.style ?? []} selected={filters.style} onToggle={toggle} />
        <Checks label="Busyness" facet="busyness" values={facets?.busyness ?? []} selected={filters.busyness} onToggle={toggle} />
      </div>
    </div>
  );
}
