"use client";

import { EMPTY_FILTERS, type Filters } from "@/lib/db/filters";
import type { Facets } from "@/lib/db/queries";

type ListKey = "supplier" | "category" | "undertone" | "texture" | "style" | "busyness";

function Checks({ label, facet, values, selected, onToggle }: {
  label: string; facet: ListKey; values: { value: string; n: number }[]; selected: string[]; onToggle: (k: ListKey, v: string) => void;
}) {
  if (!values.length) return null;
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {values.map(({ value, n }) => {
          const on = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(facet, value)}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white"}`}
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
    <label className="flex items-center gap-2 py-1 text-sm">
      <input type="checkbox" checked={filters[k]} onChange={(e) => onChange({ ...filters, [k]: e.target.checked })} />
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
      className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm"
    />
  );

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={onClose} role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Filters</h2>
          <div className="flex gap-2">
            <button type="button" className="text-sm text-zinc-600" onClick={() => onChange({ ...EMPTY_FILTERS, q: filters.q })}>Clear</button>
            <button type="button" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white" onClick={onClose}>Done</button>
          </div>
        </div>

        <Checks label="Supplier" facet="supplier" values={facets?.supplier ?? []} selected={filters.supplier} onToggle={toggle} />
        <Checks label="Category" facet="category" values={facets?.category ?? []} selected={filters.category} onToggle={toggle} />

        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Price per sq ft</legend>
          <div className="mt-1 flex items-center gap-2">{numInput("min", "min")} <span className="text-zinc-400">to</span> {numInput("max", "max")}</div>
          <p className="mt-1 text-xs text-zinc-500">Per-piece items (accessories, stone) are excluded when a range is set.</p>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Suitability</legend>
          {bool("waterproof")}{bool("radiant")}{bool("pet")}{bool("hide")}
        </fieldset>

        <Checks label="Undertone" facet="undertone" values={facets?.undertone ?? []} selected={filters.undertone} onToggle={toggle} />
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Tone depth (1 very light – 5 very dark)</legend>
          <div className="mt-1 flex items-center gap-2">{numInput("tone_min", "1", "1")} <span className="text-zinc-400">to</span> {numInput("tone_max", "5", "1")}</div>
        </fieldset>
        <Checks label="Texture" facet="texture" values={facets?.texture ?? []} selected={filters.texture} onToggle={toggle} />
        <Checks label="Style" facet="style" values={facets?.style ?? []} selected={filters.style} onToggle={toggle} />
        <Checks label="Busyness" facet="busyness" values={facets?.busyness ?? []} selected={filters.busyness} onToggle={toggle} />
      </div>
    </div>
  );
}
