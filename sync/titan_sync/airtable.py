"""Read-only Airtable access.

Only list/get endpoints are ever called. The PAT is created with data.records:read and
schema.bases:read; a write-capable token is a runbook violation, not something this module
can detect (personal access tokens do not expose their scopes to the API).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterator, Protocol

from pyairtable import Api
from pyairtable.api.retrying import retry_strategy

from .config import AirtableIds

Record = dict[str, Any]  # {"id": "rec…", "createdTime": "…", "fields": {"fld…": value}}


class Source(Protocol):
    """What the sync needs from Airtable; FakeSource in tests implements the same."""

    api_calls: int

    def iter_pages(self, since: datetime | None) -> Iterator[list[Record]]: ...
    def get_record(self, record_id: str) -> Record | None: ...
    def table_schema(self) -> list[dict[str, str]]: ...


def modified_since_formula(since: datetime) -> str:
    """Airtable formula selecting records modified after `since` (UTC)."""
    iso = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    return f"IS_AFTER(LAST_MODIFIED_TIME(), DATETIME_PARSE('{iso}'))"


@dataclass
class AirtableSource:
    token: str
    ids: AirtableIds
    page_size: int = 100
    api_calls: int = 0
    _api: Api = field(init=False, repr=False)

    def __post_init__(self) -> None:
        # pyairtable retries 429s but does not throttle; pages are fetched sequentially.
        self._api = Api(
            self.token,
            timeout=(5, 30),
            retry_strategy=retry_strategy(total=8, backoff_factor=1.5),
            use_field_ids=True,
        )

    @property
    def table(self):
        return self._api.table(self.ids.base_id, self.ids.catalogue_table_id)

    def iter_pages(self, since: datetime | None) -> Iterator[list[Record]]:
        kwargs: dict[str, Any] = {"page_size": self.page_size}
        if since is not None:
            kwargs["formula"] = modified_since_formula(since)
        for page in self.table.iterate(**kwargs):
            self.api_calls += 1
            yield page

    def get_record(self, record_id: str) -> Record | None:
        self.api_calls += 1
        try:
            return self.table.get(record_id)
        except Exception:  # 404 → treated as gone
            return None

    def table_schema(self) -> list[dict[str, str]]:
        """[{id, name, type}] for the catalogue table (Meta API, needs schema.bases:read)."""
        self.api_calls += 1
        schema = self._api.base(self.ids.base_id).schema()
        table = schema.table(self.ids.catalogue_table_id)
        return [{"id": f.id, "name": f.name, "type": f.type} for f in table.fields]
