import type { ParsedQuery } from "@/lib/db/types";

/** What the search understood from the free text, so staff can see why results are narrow. */
export function ParsedChips({ parsed }: { parsed: ParsedQuery }) {
  const chips: string[] = [];
  if (parsed.width_in !== null) chips.push(`width ${parsed.width_in}"`);
  if (parsed.thickness_mm !== null) chips.push(`${parsed.thickness_mm} mm`);
  if (parsed.install_profile) chips.push(parsed.install_profile);
  if (parsed.promo) chips.push("on promo");
  if (parsed.clearance) chips.push("clearance");
  if (parsed.waterproof) chips.push("waterproof");
  if (parsed.pet) chips.push("pet friendly");
  if (parsed.radiant) chips.push("radiant heat");
  if (parsed.category_in?.length) chips.push(parsed.category_in.join(" / "));
  if (parsed.price_min !== null) chips.push(`≥ $${parsed.price_min}`);
  if (parsed.price_max !== null) chips.push(`≤ $${parsed.price_max}`);
  if (!chips.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-zinc-600">
      <span>Understood:</span>
      {chips.map((c) => (
        <span key={c} className="rounded-full bg-zinc-200 px-2 py-0.5">{c}</span>
      ))}
      {parsed.free_text && <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-zinc-300">“{parsed.free_text}”</span>}
    </div>
  );
}
