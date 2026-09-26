from datetime import date
from decimal import Decimal

import pytest

from titan_sync import coerce


@pytest.mark.parametrize("value,expected", [
    (None, None), ("", None), ("  Vidar ", "Vidar"), (12, "12"),
])
def test_text(value, expected):
    assert coerce.text(value)[0] == expected


@pytest.mark.parametrize("value,expected", [(None, False), (True, True), (False, False), (1, True)])
def test_checkbox(value, expected):
    assert coerce.checkbox(value)[0] is expected


@pytest.mark.parametrize("value,scale,expected", [
    (4.79, 2, Decimal("4.79")), (4.7899999, 2, Decimal("4.79")), (6, 2, Decimal("6.00")), ("7.5", 2, Decimal("7.50")),
    (12, 1, Decimal("12.0")), (None, 2, None), ("", 2, None),
])
def test_number(value, scale, expected):
    assert coerce.number(value, scale=scale)[0] == expected


def test_number_bad():
    v, issue = coerce.number("abc")
    assert v is None and "not a number" in issue


def test_currency_two_decimals():
    assert coerce.currency(3.5)[0] == Decimal("3.50")


@pytest.mark.parametrize("value,expected", [(3, 3), ("5", 5), (None, None), (0, None), (7, None)])
def test_rating(value, expected):
    assert coerce.rating(value)[0] == expected


def test_single_select_plain_and_object():
    assert coerce.single_select("LVP", field_name="Category")[0] == "LVP"
    assert coerce.single_select({"id": "sel1", "name": "LVP"}, field_name="Category")[0] == "LVP"


def test_single_select_header_junk_becomes_null_with_issue():
    v, issue = coerce.single_select("Category", field_name="Category")
    assert v is None and "field name" in issue


def test_multi_select_splits_semicolons_and_dedupes():
    v, issue = coerce.multi_select(["Floorscore;CARB II;FSC;CE", "Floorscore", " CE "], field_name="Certifications")
    assert v == ["Floorscore", "CARB II", "FSC", "CE"]
    assert issue is None


def test_multi_select_drops_header_junk():
    v, issue = coerce.multi_select(["Kitchen", "Suitable rooms"], field_name="Suitable rooms")
    assert v == ["Kitchen"] and issue


def test_multi_select_empty():
    assert coerce.multi_select(None)[0] == []


@pytest.mark.parametrize("value,expected", [("2026-09-26", date(2026, 9, 26)), ("2026-09-26T10:00:00.000Z", date(2026, 9, 26)), (None, None)])
def test_day(value, expected):
    assert coerce.day(value)[0] == expected


def test_day_bad():
    v, issue = coerce.day("yesterday")
    assert v is None and "not a date" in issue


def test_timestamp_utc():
    v, _ = coerce.timestamp("2026-09-26T10:00:00.000Z")
    assert v.tzinfo is not None and v.hour == 10


def test_sku_blank_is_issue():
    assert coerce.sku("  ")[1] == "blank SKU"
    assert coerce.sku("ENG-VIDR-0042")[0] == "ENG-VIDR-0042"


def test_attachments_keep_only_needed_keys():
    v, _ = coerce.attachments([{"id": "att1", "url": "u", "filename": "a.jpg", "type": "image/jpeg", "size": 3, "thumbnails": {"x": 1}}, {"bogus": 1}])
    assert v == [{"id": "att1", "url": "u", "filename": "a.jpg", "type": "image/jpeg", "size": 3, "width": None, "height": None}]
