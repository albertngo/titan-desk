"""Airtable field → mirror.catalogue column map, keyed by field ID.

IDs come from platform-settings/airtable.json (never names: Airtable fields get renamed;
"Last price update" became "Effective Date"). Every field in sync/schema_snapshot.json must be
either mapped here or listed in SKIP, or test_fields_complete fails.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from . import coerce
from .config import AirtableIds

TIER_PUBLIC, TIER_STAFF, TIER_SYSTEM = "public", "staff", "system"


@dataclass(frozen=True)
class FieldSpec:
    key: str            # key in platform-settings/airtable.json → "fields"
    column: str         # mirror.catalogue column, or "images:<kind>" / "modified"
    kind: str           # coercer name
    tier: str
    name: str           # Airtable field name (for junk-option detection and messages)
    scale: int = 2      # numeric scale for "number"


# (json key, column, coercer kind, tier, airtable name[, scale])
_SPECS: list[tuple[Any, ...]] = [
    ("sku", "sku", "sku", TIER_PUBLIC, "SKU"),
    ("effective_date", "last_price_update", "date", TIER_STAFF, "Effective Date"),
    ("product_name", "product_name", "text", TIER_PUBLIC, "Product name"),
    ("brand", "brand", "text", TIER_PUBLIC, "Brand"),
    ("supplier", "supplier", "select", TIER_STAFF, "Supplier"),
    ("supplier_sku", "supplier_sku", "text", TIER_STAFF, "Supplier SKU"),
    ("lightspeed_id", "lightspeed_id", "text", TIER_SYSTEM, "Lightspeed ID"),
    ("ls_handle", "ls_handle", "text", TIER_SYSTEM, "LS Handle / Parent ID"),
    ("collection", "collection", "text", TIER_PUBLIC, "Collection"),
    ("product_type", "product_type", "select", TIER_PUBLIC, "Product type"),
    ("category", "category", "select", TIER_PUBLIC, "Category"),
    ("material_type", "material_type", "select", TIER_PUBLIC, "Material type"),
    ("species", "species", "select", TIER_PUBLIC, "Species"),
    ("colour_tone", "colour_tone", "select", TIER_PUBLIC, "Colour / tone"),
    ("grade", "grade", "select", TIER_PUBLIC, "Grade"),
    ("layout_pattern", "layout_pattern", "select", TIER_PUBLIC, "Layout pattern"),
    ("width_in", "width_in", "number", TIER_PUBLIC, "Width (in)", 2),
    ("length", "length", "text", TIER_PUBLIC, "Length"),
    ("thickness_mm", "thickness_mm", "number", TIER_PUBLIC, "Thickness (mm)", 1),
    ("wear_layer_mil", "wear_layer_mil", "number", TIER_PUBLIC, "Wear layer (mil)", 1),
    ("veneer_mm", "veneer_mm", "number", TIER_PUBLIC, "Veneer / top layer (mm)", 2),
    ("veneer_cut_type", "veneer_cut_type", "select", TIER_PUBLIC, "Veneer cut type"),
    ("ac_rating", "ac_rating", "select", TIER_PUBLIC, "AC rating"),
    ("finish_type", "finish_type", "select", TIER_PUBLIC, "Finish type"),
    ("install_profile", "install_profile", "select", TIER_PUBLIC, "Install profile"),
    ("install_method", "install_method", "select", TIER_PUBLIC, "Install method"),
    ("locking_system", "locking_system", "text", TIER_PUBLIC, "Locking system"),
    ("underpad_included", "underpad_included", "checkbox", TIER_PUBLIC, "Underpad included"),
    ("underpad_type", "underpad_type", "select", TIER_PUBLIC, "Underpad type"),
    ("iic_rating", "iic_rating", "number", TIER_PUBLIC, "IIC rating", 1),
    ("stc_rating", "stc_rating", "number", TIER_PUBLIC, "STC rating", 1),
    ("tile_format", "tile_format", "select", TIER_PUBLIC, "Tile format"),
    ("weight_per_piece_kg", "weight_per_piece_kg", "number", TIER_PUBLIC, "Weight per piece (kg)", 3),
    ("certifications", "certifications", "multiselect", TIER_PUBLIC, "Certifications"),
    ("cost", "cost", "currency", TIER_STAFF, "Cost/unit"),
    ("retail_price", "retail_price", "currency", TIER_STAFF, "Retail price/unit"),
    ("map_price", "map_price", "currency", TIER_STAFF, "MAP price ($/sf)"),
    ("pallet_price", "pallet_price", "currency", TIER_STAFF, "Pallet price ($/sf)"),
    ("promo_cost", "promo_cost", "currency", TIER_STAFF, "Promo cost ($/sf)"),
    ("promo_end_date", "promo_end_date", "date", TIER_STAFF, "Promo end date"),
    ("volume_pricing_notes", "volume_pricing_notes", "text", TIER_STAFF, "Volume pricing notes"),
    ("price_last_changed_by", "price_last_changed_by", "select", TIER_STAFF, "Price last changed by"),
    ("box_size_sf", "box_size_sf", "number", TIER_PUBLIC, "Box size (sf)", 2),
    ("pieces_per_box", "pieces_per_box", "number", TIER_PUBLIC, "Pieces per box", 2),
    ("boxes_per_skid", "boxes_per_skid", "number", TIER_STAFF, "Boxes per skid", 2),
    ("pieces_per_pallet", "pieces_per_pallet", "number", TIER_STAFF, "Pieces per pallet", 2),
    ("stock_status", "stock_status", "select", TIER_PUBLIC, "Stock status"),
    ("active", "active", "checkbox", TIER_STAFF, "Active"),
    ("waterproof", "waterproof", "checkbox", TIER_PUBLIC, "Waterproof"),
    ("pet_friendly", "pet_friendly", "checkbox", TIER_PUBLIC, "Pet friendly"),
    ("radiant_heat_compatible", "radiant_heat_compatible", "checkbox", TIER_PUBLIC, "Radiant heat compatible"),
    ("traffic_rating", "traffic_rating", "select", TIER_PUBLIC, "Traffic rating"),
    ("suitable_rooms", "suitable_rooms", "multiselect", TIER_PUBLIC, "Suitable rooms"),
    ("residential_warranty_yrs", "residential_warranty_yrs", "number", TIER_PUBLIC, "Residential warranty (yrs)", 1),
    ("commercial_warranty_yrs", "commercial_warranty_yrs", "number", TIER_PUBLIC, "Commercial warranty (yrs)", 1),
    ("salesperson_notes", "salesperson_notes", "text", TIER_STAFF, "Salesperson notes"),
    ("pairs_well_with", "pairs_well_with", "text", TIER_PUBLIC, "Pairs well with"),
    ("price_list_url", "price_list_url", "url", TIER_STAFF, "Price List URL"),
    # the date of the list Price List URL links to (added 2026-09-28): staff tier
    ("internal_notes", "internal_notes", "text", TIER_STAFF, "Internal notes"),
    # pricing extras added 2026-09-26 (rep rates and promo-list provenance): staff tier
    ("promo_list_url", "promo_list_url", "url", TIER_STAFF, "Promo List URL"),
    ("rep_cost", "rep_cost", "currency", TIER_STAFF, "Rep cost ($/sf)"),
    ("rep_cost_end_date", "rep_cost_end_date", "date", TIER_STAFF, "Rep cost end date"),
    ("rep_cost_note", "rep_cost_note", "text", TIER_STAFF, "Rep cost note"),
    # images: three attachment fields → mirror.catalogue.image_attachments (system) → --mode images
    ("swatch_images", "images:swatch", "attachments", TIER_SYSTEM, "Swatch images"),
    ("room_scene_images", "images:room", "attachments", TIER_SYSTEM, "Room scene images"),
    ("detail_images", "images:detail", "attachments", TIER_SYSTEM, "Detail images"),
    # design / style
    ("undertone", "undertone", "select", TIER_PUBLIC, "Undertone"),
    ("tone_depth", "tone_depth", "rating", TIER_PUBLIC, "Tone depth"),
    ("texture", "texture", "select", TIER_PUBLIC, "Texture"),
    ("style", "style", "multiselect", TIER_PUBLIC, "Style"),
    ("busyness", "busyness", "select", TIER_PUBLIC, "Busyness"),
    ("style_tags_status", "style_tags_status", "select", TIER_STAFF, "Style tags status"),
    ("style_tags_evidence", "style_tags_evidence", "text", TIER_STAFF, "Style tags evidence"),
    # system
    ("last_modified", "modified", "timestamp", TIER_SYSTEM, "Last modified"),
]

# Airtable fields that exist but are deliberately not mirrored (json keys).
SKIP: dict[str, str] = {
    "price_history_log_legacy": "legacy free-text field, superseded by Price History Log v2",
    "attachments": "spec sheets; not mirrored in v1",
    "attachment_summary": "AI summary of Attachments; not mirrored",
    "price_history_log_v2": "linked records; the price_history mirror is Phase 5",
    "price_list_date": "not used: Effective Date dates the linked price list (Albert, 2026-10-03)",
}

SPECS: list[FieldSpec] = [
    FieldSpec(key=t[0], column=t[1], kind=t[2], tier=t[3], name=t[4], scale=(t[5] if len(t) > 5 else 2))
    for t in _SPECS
]

# Columns written to mirror.catalogue_stage / merged into mirror.catalogue, in a fixed order.
CATALOGUE_COLUMNS: list[str] = [
    "airtable_record_id", "airtable_created_at", "airtable_modified_at",
    *[s.column for s in SPECS if not s.column.startswith("images:") and s.column != "modified"],
    "image_attachments",
]

IMAGE_KINDS = {"images:swatch": "swatch", "images:room": "room", "images:detail": "detail"}


def field_map(ids: AirtableIds) -> dict[str, FieldSpec]:
    """{airtable field id: spec} for every mapped field whose id is configured."""
    out: dict[str, FieldSpec] = {}
    for spec in SPECS:
        fid = ids.fields.get(spec.key)
        if fid:
            out[fid] = spec
    return out


def skipped_field_ids(ids: AirtableIds) -> set[str]:
    return {ids.fields[k] for k in SKIP if ids.fields.get(k)}
