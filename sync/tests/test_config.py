"""Secrets pasted into GitHub's form: whitespace and quotes are tolerated, a wrong prefix is named."""

import pytest

from titan_sync.config import ConfigError, _clean, _database_url

URL = "postgresql://sync_worker.ref:pw@aws-0-ca-central-1.pooler.supabase.com:5432/postgres"


@pytest.mark.parametrize("raw", [URL, f" {URL}", f"{URL}\n", f"\n{URL}\r\n", f'"{URL}"', f"'{URL}'", f' "{URL}" \n'])
def test_clean_strips_whitespace_and_quotes(raw):
    assert _clean(raw) == URL


def test_clean_keeps_inner_quotes_and_empty_is_none():
    assert _clean("a\"b") == "a\"b"
    assert _clean("  ") is None
    assert _clean(None) is None


def test_database_url_prefix_checked_without_echoing_the_value():
    assert _database_url(URL) == URL
    assert _database_url(None) is None
    with pytest.raises(ConfigError) as ex:
        _database_url("DATABASE_URL=" + URL)
    assert "pw" not in str(ex.value)
