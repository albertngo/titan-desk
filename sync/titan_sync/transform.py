"""Airtable record → mirror.catalogue row dict (keys = fields.CATALOGUE_COLUMNS)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from . import coerce
from .fields import CATALOGUE_COLUMNS, IMAGE_KINDS, FieldSpec


@dataclass
class RowIssue:
    kind: str
    message: str
    field: str | None = None


@dataclass
class Converted:
    row: dict[str, Any]
    issues: list[RowIssue] = field(default_factory=list)
    unknown_field_ids: set[str] = field(default_factory=set)

    @property
    def record_id(self) -> str:
        return self.row["airtable_record_id"]

    @property
    def sku(self) -> str | None:
        return self.row.get("sku")


def record_to_row(record: dict[str, Any], fmap: dict[str, FieldSpec], *, skip_ids: set[str],
                  fallback_modified: datetime) -> Converted:
    fields = record.get("fields") or {}
    row: dict[str, Any] = {c: None for c in CATALOGUE_COLUMNS}
    row["airtable_record_id"] = record["id"]
    row["airtable_created_at"], _ = coerce.timestamp(record.get("createdTime"))
    row["airtable_modified_at"] = fallback_modified
    row["image_attachments"] = []
    for c in ("underpad_included", "active", "waterproof", "pet_friendly", "radiant_heat_compatible"):
        row[c] = False
    for c in ("certifications", "suitable_rooms", "style"):
        row[c] = []

    out = Converted(row=row)
    images: list[dict[str, Any]] = []

    for fid, spec in fmap.items():
        raw = fields.get(fid)
        coercer = coerce.COERCERS[spec.kind]
        value, issue = coercer(raw, field_name=spec.name, scale=spec.scale)
        if issue:
            out.issues.append(RowIssue(kind=f"bad_{spec.kind}", message=issue, field=spec.name))
        if spec.column in IMAGE_KINDS:
            kind = IMAGE_KINDS[spec.column]
            for i, att in enumerate(value or []):
                images.append({"kind": kind, "sort": i, **att})
        elif spec.column == "modified":
            if value is not None:
                row["airtable_modified_at"] = value
        else:
            row[spec.column] = value

    row["image_attachments"] = images
    out.unknown_field_ids = {fid for fid in fields if fid not in fmap and fid not in skip_ids}
    return out
