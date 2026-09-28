import Link from "next/link";
import { CollectionTiles } from "@/components/CollectionTiles";
import { ImageGallery } from "@/components/ImageGallery";
import { PriceBlock } from "@/components/PriceBlock";
import { StockBadge } from "@/components/ResultCard";
import { collectionMembers, type CollectionMember } from "@/lib/card";
import type { CatalogueStaffRow } from "@/lib/db/types";
import { dateShort, num, yesNo } from "@/lib/format";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "" || value === "—") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-1.5 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The supplier's own list, one tap from the price, for re-verifying what the mirror says.
 * When the linked list's date differs from the price's Effective Date, the price came from a
 * different list than the one linked — say so, since that is the thing to check.
 */
function PriceListCheck({ product: p }: { product: CatalogueStaffRow }) {
  if (!p.price_list_url) {
    return <p className="mt-2 text-xs text-zinc-500">No supplier price list linked yet.</p>;
  }
  const differs = p.price_list_date !== null && p.last_price_update !== null && p.price_list_date !== p.last_price_update;
  return (
    <div className="mt-2 space-y-1">
      <a href={p.price_list_url} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm active:bg-zinc-50">
        Supplier price list{p.price_list_date ? ` · ${dateShort(p.price_list_date)}` : ""} ↗
      </a>
      {differs && (
        <p className="text-xs text-amber-800">
          Price dated {dateShort(p.last_price_update)}; this list is dated {dateShort(p.price_list_date)}. Check the price against it.
        </p>
      )}
    </div>
  );
}

export function ProductDetail({ product: p, collection }: {
  product: CatalogueStaffRow;
  collection?: { rows: CollectionMember[]; total: number } | null;
}) {
  const colours = collection ? collectionMembers(p, collection.rows) : [];
  const dims = [p.width_in !== null ? `${num(p.width_in)}"` : null, p.length, p.thickness_mm !== null ? `${num(p.thickness_mm)} mm` : null]
    .filter(Boolean)
    .join(" × ");
  return (
    <article>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight">{p.product_name ?? p.sku}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {[p.brand, p.collection, p.category].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
            <span className="font-mono">{p.sku}</span>
            {p.supplier && <span>· {p.supplier}{p.supplier_sku ? ` ${p.supplier_sku}` : ""}</span>}
            <StockBadge status={p.stock_status} comingSoon={p.coming_soon} />
            {!p.active && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-white">Archived</span>}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <ImageGallery images={p.images ?? []} alt={p.product_name ?? p.sku} />
      </div>

      <PriceBlock product={p} />

      <PriceListCheck product={p} />

      {p.variants?.length ? (
        <Section title="Also in">
          <div className="flex flex-wrap gap-1.5">
            {p.variants.map((v) => (
              <Link
                key={v.sku}
                href={`/p/${encodeURIComponent(v.sku)}`}
                className={`rounded-full border px-2.5 py-1 text-xs ${v.active === false ? "border-dashed border-zinc-300 text-zinc-400" : "border-zinc-300 bg-white"}`}
              >
                {v.variant_label ?? v.sku}
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      <CollectionTiles members={colours} total={collection?.total ?? 0} current={p.sku} supplier={p.supplier} />

      <Section title="Specs">
        <dl>
          <Row label="Size" value={dims || null} />
          <Row label="Material" value={p.material_type} />
          <Row label="Species" value={p.species} />
          <Row label="Grade" value={p.grade} />
          <Row label="Colour / tone" value={p.colour_tone} />
          <Row label="Layout" value={p.layout_pattern} />
          <Row label="Wear layer" value={p.wear_layer_mil !== null ? `${num(p.wear_layer_mil)} mil` : null} />
          <Row label="Veneer" value={p.veneer_mm !== null ? `${num(p.veneer_mm)} mm${p.veneer_cut_type ? ` · ${p.veneer_cut_type}` : ""}` : null} />
          <Row label="AC rating" value={p.ac_rating} />
          <Row label="Finish" value={p.finish_type} />
          <Row label="Install" value={[p.install_profile, p.install_method, p.locking_system].filter(Boolean).join(" · ") || null} />
          <Row label="Underpad" value={p.underpad_included ? (p.underpad_type ?? "Attached") : "None attached"} />
          <Row label="IIC / STC" value={p.iic_rating !== null || p.stc_rating !== null ? `${num(p.iic_rating)} / ${num(p.stc_rating)}` : null} />
          <Row label="Tile format" value={p.tile_format} />
          <Row label="Weight / piece" value={p.weight_per_piece_kg !== null ? `${num(p.weight_per_piece_kg)} kg` : null} />
          <Row label="Certifications" value={p.certifications.length ? p.certifications.join(", ") : null} />
        </dl>
      </Section>

      <Section title="Packaging">
        <dl>
          <Row label="Box" value={p.box_size_sf !== null ? `${num(p.box_size_sf)} sf` : null} />
          <Row label="Pieces / box" value={num(p.pieces_per_box)} />
          <Row label="Boxes / skid" value={num(p.boxes_per_skid)} />
          <Row label="Pieces / pallet" value={num(p.pieces_per_pallet)} />
        </dl>
      </Section>

      <Section title="Suitability">
        <dl>
          <Row label="Waterproof" value={yesNo(p.waterproof)} />
          <Row label="Pet friendly" value={yesNo(p.pet_friendly)} />
          <Row label="Radiant heat" value={yesNo(p.radiant_heat_compatible)} />
          <Row label="Traffic" value={p.traffic_rating} />
          <Row label="Rooms" value={p.suitable_rooms.length ? p.suitable_rooms.join(", ") : null} />
          <Row label="Warranty" value={p.residential_warranty_yrs !== null || p.commercial_warranty_yrs !== null ? `${num(p.residential_warranty_yrs)} yr residential · ${num(p.commercial_warranty_yrs)} yr commercial` : null} />
        </dl>
      </Section>

      {(p.undertone || p.tone_depth || p.texture || p.style.length || p.busyness) ? (
        <Section title="Design">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {p.undertone && <span className="rounded-full bg-zinc-200 px-2 py-0.5">{p.undertone}</span>}
            {p.tone_depth && <span className="rounded-full bg-zinc-200 px-2 py-0.5">tone {p.tone_depth}/5</span>}
            {p.texture && <span className="rounded-full bg-zinc-200 px-2 py-0.5">{p.texture}</span>}
            {p.style.map((s) => <span key={s} className="rounded-full bg-zinc-200 px-2 py-0.5">{s}</span>)}
            {p.busyness && <span className="rounded-full bg-zinc-200 px-2 py-0.5">{p.busyness}</span>}
            {p.style_tags_status && (
              <span className={`rounded-full px-2 py-0.5 ${p.style_tags_status === "Staff confirmed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {p.style_tags_status}
              </span>
            )}
          </div>
        </Section>
      ) : null}

      {p.salesperson_notes && (
        <Section title="Salesperson notes">
          <p className="whitespace-pre-wrap text-sm">{p.salesperson_notes}</p>
        </Section>
      )}
      {p.internal_notes && (
        <Section title="Internal notes">
          <p className="whitespace-pre-wrap text-sm text-zinc-600">{p.internal_notes}</p>
        </Section>
      )}

      {p.pairs_well_with?.length ? (
        <Section title="Pairs well with">
          <ul className="space-y-1">
            {p.pairs_well_with.map((x) => (
              <li key={x.sku}>
                <Link href={`/p/${encodeURIComponent(x.sku)}`} className="text-sm underline decoration-zinc-300 underline-offset-2">
                  {x.product_name ?? x.sku}
                </Link>
                {x.active === false && <span className="ml-1 text-xs text-zinc-400">(archived)</span>}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Links">
        <div className="flex flex-wrap gap-3 text-sm">
          <a href={p.airtable_url} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5">
            Report an issue (opens Airtable)
          </a>
          {p.promo_list_url && (
            <a href={p.promo_list_url} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5">
              Promo list
            </a>
          )}
        </div>
      </Section>
    </article>
  );
}
