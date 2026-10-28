import Link from "next/link";
import type { ReactNode } from "react";
import { ShortcutIcon } from "@/components/askbert/ShortcutIcon";
import { CollectionTiles } from "@/components/CollectionTiles";
import { ImageGallery } from "@/components/ImageGallery";
import { PriceBlock } from "@/components/PriceBlock";
import { AskBertButton, BackLink } from "@/components/product/ProductActions";
import { StockBadge } from "@/components/StockBadge";
import { typeOf } from "@/lib/browse";
import { boxPrice, collectionMembers, splitName, type CollectionMember } from "@/lib/card";
import { EMPTY_FILTERS, filtersToSearchParams } from "@/lib/db/filters";
import type { CatalogueStaffRow } from "@/lib/db/types";
import { dateShort, money, num, priceLabel } from "@/lib/format";

/** Catalogue checkboxes are unticked when nobody recorded them: "not confirmed", never "no". */
const confirmed = (v: boolean) => (v ? "Yes" : "Not confirmed");

function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "" || value === "—") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-cream-deep py-1.5 text-sm last:border-0">
      <dt className="text-ink/55">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-white px-4 py-3 ring-1 ring-denim/10 ${className}`}>
      <h2 className="text-sm font-semibold text-denim">{title}</h2>
      <div className="mt-1">{children}</div>
    </section>
  );
}

/** Shop › Type › Supplier, each a link back into the browse screen at that point. */
function Trail({ p }: { p: CatalogueStaffRow }) {
  const type = p.category ? typeOf(p.category) : null;
  const href = (o: Partial<typeof EMPTY_FILTERS>) => `/?${filtersToSearchParams({ ...EMPTY_FILTERS, ...o })}`;
  const steps: { label: string; href: string }[] = [{ label: "Shop", href: "/" }];
  if (type) steps.push({ label: type.label, href: href({ by: "type", category: type.categories }) });
  if (type && p.supplier) steps.push({ label: titleCase(p.supplier), href: href({ by: "type", category: type.categories, supplier: [p.supplier] }) });
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-ink/60">
      {steps.map((s, i) => (
        <span key={s.href} className="flex items-center gap-1">
          {i > 0 && <ShortcutIcon name="chevron" className="h-3.5 w-3.5 text-ink/30" />}
          <Link href={s.href} className="rounded px-1 underline-offset-4 hover:text-denim hover:underline">{s.label}</Link>
        </span>
      ))}
    </nav>
  );
}

function titleCase(name: string): string {
  return name.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/** Host of a URL for a link label ("vidarflooring.com"), or the raw value. */
function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ProductDetail({ product: p, collection }: {
  product: CatalogueStaffRow;
  collection?: { rows: CollectionMember[]; total: number } | null;
}) {
  const colours = collection ? collectionMembers(p, collection.rows) : [];
  const name = splitName(p.product_name, p.brand, p.sku);
  const box = boxPrice(p.retail_price, p.price_unit, p.price_on_request, p.box_size_sf);
  const dims = [p.width_in !== null ? `${num(p.width_in)}"` : null, p.length, p.thickness_mm !== null ? `${num(p.thickness_mm)} mm` : null]
    .filter(Boolean)
    .join(" × ");
  const quick = [
    p.waterproof && "Waterproof",
    p.radiant_heat_compatible && "Radiant heat",
    p.pet_friendly && "Pet friendly",
    p.wear_layer_mil !== null && `${num(p.wear_layer_mil)} mil wear layer`,
    p.install_profile,
  ].filter(Boolean) as string[];

  return (
    <article>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <BackLink />
        <Trail p={p} />
      </div>

      <header className="mt-3">
        {name.line && <p className="text-sm text-ink/60">{name.line}</p>}
        <h1 className="font-display text-2xl font-bold leading-tight text-denim [text-wrap:balance] sm:text-[28px]">
          {name.title}
          {name.badge && <span className="ml-2 align-middle text-sm font-semibold text-ink/50">({name.badge})</span>}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink/55">
          <span className="font-mono">{p.sku}</span>
          {p.supplier && <span>· {titleCase(p.supplier)}{p.supplier_sku ? ` ${p.supplier_sku}` : ""}</span>}
          {(name.size || name.detail) && <span>· {[name.size, name.detail].filter(Boolean).join(" · ")}</span>}
          {p.promo_active && <span className="rounded-md bg-campfire-dark px-1.5 py-0.5 text-[11px] font-semibold text-cream">On promo{p.promo_end_date ? ` to ${dateShort(p.promo_end_date)}` : ""}</span>}
          <StockBadge status={p.stock_status} comingSoon={p.coming_soon} />
          {!p.active && <span className="rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-cream">Archived</span>}
        </p>
      </header>

      <div className="mt-3 grid gap-4 md:grid-cols-2 md:gap-6">
        <div className="min-w-0">
          <ImageGallery images={p.images ?? []} alt={p.product_name ?? p.sku} />
          {p.supplier_product_page && (
            <p className="mt-1.5 text-xs text-ink/55">
              Photos from{" "}
              <a href={p.supplier_product_page} target="_blank" rel="noreferrer" className="font-medium text-denim underline underline-offset-2">
                {host(p.supplier_product_page)} ↗
              </a>
            </p>
          )}
        </div>

        <div className="min-w-0">
          <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-denim/10">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className={`text-[28px] font-bold leading-none tabular-nums ${p.promo_active ? "text-campfire-dark" : "text-denim"}`}>
                {priceLabel(p.retail_price, p.price_unit, p.price_on_request)}
              </span>
              {box !== null && p.box_size_sf !== null && (
                <span className="text-sm tabular-nums text-ink/60">{money(box)} per box of {num(p.box_size_sf)} sf</span>
              )}
            </p>
            {quick.length > 0 && (
              <ul className="mt-2.5 flex flex-wrap gap-1">
                {quick.map((q) => (
                  <li key={q} className="flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-xs font-medium text-ink ring-1 ring-denim/10">
                    <ShortcutIcon name="check" className="h-3 w-3 text-denim" />
                    {q}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {p.price_list_url ? (
                <a href={p.price_list_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-denim px-3 py-2 text-sm font-semibold text-cream transition hover:bg-denim-dark active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim">
                  Supplier price list{p.last_price_update ? ` · ${dateShort(p.last_price_update)}` : ""}
                  <ShortcutIcon name="external" className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span className="inline-flex items-center rounded-lg bg-cream-deep px-3 py-2 text-sm text-ink/60">No supplier price list linked yet</span>
              )}
              <AskBertButton sku={p.sku} />
            </div>
          </div>

          <PriceBlock product={p} />

          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {p.promo_list_url && (
              <a href={p.promo_list_url} target="_blank" rel="noreferrer" className="font-medium text-denim underline underline-offset-4">Promo list ↗</a>
            )}
            <a href={p.airtable_url} target="_blank" rel="noreferrer" className="font-medium text-denim underline underline-offset-4">
              Report an issue in Airtable ↗
            </a>
          </p>
        </div>
      </div>

      {p.variants?.length ? (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-denim">Also in</h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {p.variants.map((v) => (
              <Link
                key={v.sku}
                href={`/p/${encodeURIComponent(v.sku)}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${v.active === false ? "text-ink/40 ring-1 ring-dashed ring-ink/20" : "bg-white text-denim ring-1 ring-denim/15 hover:ring-denim/40"}`}
              >
                {v.variant_label ?? v.sku}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <CollectionTiles members={colours} total={collection?.total ?? 0} current={p.sku} supplier={p.supplier} />

      <div className="mt-5 grid items-start gap-3 md:grid-cols-2">
        <Card title="Specs">
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
            <Row label="Underpad" value={p.underpad_included ? (p.underpad_type ?? "Attached") : "Not attached"} />
            <Row label="IIC / STC" value={p.iic_rating !== null || p.stc_rating !== null ? `${num(p.iic_rating)} / ${num(p.stc_rating)}` : null} />
            <Row label="Tile format" value={p.tile_format} />
            <Row label="Weight / piece" value={p.weight_per_piece_kg !== null ? `${num(p.weight_per_piece_kg)} kg` : null} />
            <Row label="Certifications" value={p.certifications.length ? p.certifications.join(", ") : null} />
          </dl>
        </Card>

        <Card title="Suitability">
          <dl>
            <Row label="Waterproof" value={confirmed(p.waterproof)} />
            <Row label="Pet friendly" value={confirmed(p.pet_friendly)} />
            <Row label="Radiant heat" value={confirmed(p.radiant_heat_compatible)} />
            <Row label="Traffic" value={p.traffic_rating} />
            <Row label="Rooms" value={p.suitable_rooms.length ? p.suitable_rooms.join(", ") : null} />
            <Row label="Warranty" value={p.residential_warranty_yrs !== null || p.commercial_warranty_yrs !== null ? `${num(p.residential_warranty_yrs)} yr residential · ${num(p.commercial_warranty_yrs)} yr commercial` : null} />
          </dl>
          {(p.undertone || p.tone_depth || p.texture || p.style.length || p.busyness) ? (
            <div className="mt-2 border-t border-cream-deep pt-2">
              <h3 className="text-xs font-semibold text-ink/60">Design</h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                {p.undertone && <span className="rounded-full bg-sky px-2 py-0.5 font-medium text-denim">{p.undertone}</span>}
                {p.tone_depth && <span className="rounded-full bg-sky px-2 py-0.5 font-medium text-denim">Tone {p.tone_depth}/5</span>}
                {p.texture && <span className="rounded-full bg-sky px-2 py-0.5 font-medium text-denim">{p.texture}</span>}
                {p.style.map((s) => <span key={s} className="rounded-full bg-sky px-2 py-0.5 font-medium text-denim">{s}</span>)}
                {p.busyness && <span className="rounded-full bg-sky px-2 py-0.5 font-medium text-denim">{p.busyness}</span>}
                {p.style_tags_status && (
                  <span className={`rounded-full px-2 py-0.5 font-medium ${p.style_tags_status === "Staff confirmed" ? "bg-denim text-cream" : "bg-peach text-campfire-dark"}`}>
                    {p.style_tags_status}
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="Packaging">
          <dl>
            <Row label="Box" value={p.box_size_sf !== null ? `${num(p.box_size_sf)} sf` : null} />
            <Row label="Pieces / box" value={num(p.pieces_per_box)} />
            <Row label="Boxes / skid" value={num(p.boxes_per_skid)} />
            <Row label="Pieces / pallet" value={num(p.pieces_per_pallet)} />
          </dl>
        </Card>

        {p.salesperson_notes && (
          <Card title="Salesperson notes">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.salesperson_notes}</p>
          </Card>
        )}
        {p.internal_notes && (
          <Card title="Internal notes">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/75">{p.internal_notes}</p>
          </Card>
        )}
        {p.pairs_well_with?.length ? (
          <Card title="Pairs well with">
            <ul className="divide-y divide-cream-deep">
              {p.pairs_well_with.map((x) => (
                <li key={x.sku}>
                  <Link href={`/p/${encodeURIComponent(x.sku)}`} className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink hover:text-denim">
                    <span className="min-w-0 truncate">{x.product_name ?? x.sku}{x.active === false && <span className="ml-1 text-ink/40">(archived)</span>}</span>
                    <ShortcutIcon name="chevron" className="h-4 w-4 shrink-0 text-denim/40" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </article>
  );
}
