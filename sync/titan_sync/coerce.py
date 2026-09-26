"""Airtable cell value → Postgres column value.

Every coercer returns (value, issue) where issue is None or a short message. A coercer never
raises: bad data becomes NULL plus a sync_issues row, and the run continues.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

Issue = str | None


def text(value: Any, **_: Any) -> tuple[str | None, Issue]:
    if value is None:
        return None, None
    s = str(value).strip()
    return (s or None), None


def url(value: Any, **_: Any) -> tuple[str | None, Issue]:
    return text(value)


def checkbox(value: Any, **_: Any) -> tuple[bool, Issue]:
    return bool(value), None


def number(value: Any, *, scale: int = 2, **_: Any) -> tuple[Decimal | None, Issue]:
    if value is None or value == "":
        return None, None
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None, f"not a number: {value!r}"
    if not d.is_finite():
        return None, f"not a finite number: {value!r}"
    return d.quantize(Decimal(1).scaleb(-scale)), None


def currency(value: Any, **_: Any) -> tuple[Decimal | None, Issue]:
    return number(value, scale=2)


def rating(value: Any, *, lo: int = 1, hi: int = 5, **_: Any) -> tuple[int | None, Issue]:
    if value is None or value == "":
        return None, None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None, f"not a rating: {value!r}"
    if not lo <= n <= hi:
        return None, f"rating out of range: {n}"
    return n, None


def single_select(value: Any, *, field_name: str = "", **_: Any) -> tuple[str | None, Issue]:
    """Option name as text. Header-name junk options ("Category" in Category) become NULL."""
    if value is None:
        return None, None
    if isinstance(value, dict):  # some clients return {id, name, color}
        value = value.get("name")
    s = str(value).strip()
    if not s:
        return None, None
    if field_name and s.lower() == field_name.lower():
        return None, f"option equals the field name ({s!r}); treated as blank"
    return s, None


_SPLIT = re.compile(r"\s*;\s*")


def multi_select(value: Any, *, field_name: str = "", **_: Any) -> tuple[list[str], Issue]:
    """List of option names; each option is split on ';' (import artefacts), trimmed, deduped."""
    if not value:
        return [], None
    if isinstance(value, str):
        value = [value]
    out: list[str] = []
    issue: Issue = None
    for raw in value:
        name = raw.get("name") if isinstance(raw, dict) else raw
        for part in _SPLIT.split(str(name)):
            part = part.strip()
            if not part:
                continue
            if field_name and part.lower() == field_name.lower():
                issue = f"option equals the field name ({part!r}); dropped"
                continue
            if part not in out:
                out.append(part)
    return out, issue


def day(value: Any, **_: Any) -> tuple[date | None, Issue]:
    if value is None or value == "":
        return None, None
    s = str(value)
    try:
        return date.fromisoformat(s[:10]), None
    except ValueError:
        return None, f"not a date: {value!r}"


def timestamp(value: Any, **_: Any) -> tuple[datetime | None, Issue]:
    if value is None or value == "":
        return None, None
    s = str(value).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None, f"not a timestamp: {value!r}"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt, None


def sku(value: Any, **_: Any) -> tuple[str | None, Issue]:
    s, _ = text(value)
    if not s:
        return None, "blank SKU"
    return s, None


def attachments(value: Any, **_: Any) -> tuple[list[dict[str, Any]], Issue]:
    """Keep only what the image job needs. URLs expire; they are a first attempt only."""
    if not value:
        return [], None
    out = []
    for a in value:
        if not isinstance(a, dict) or not a.get("id"):
            continue
        out.append({
            "id": a["id"],
            "url": a.get("url"),
            "filename": a.get("filename"),
            "type": a.get("type"),
            "size": a.get("size"),
            "width": a.get("width"),
            "height": a.get("height"),
        })
    return out, None


COERCERS = {
    "text": text,
    "url": url,
    "checkbox": checkbox,
    "number": number,
    "currency": currency,
    "rating": rating,
    "select": single_select,
    "multiselect": multi_select,
    "date": day,
    "timestamp": timestamp,
    "sku": sku,
    "attachments": attachments,
}
