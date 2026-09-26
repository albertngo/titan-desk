"""Environment configuration for the sync worker. Variable NAMES are documented in .env.example."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PLATFORM_SETTINGS = REPO_ROOT / "platform-settings" / "airtable.json"


class ConfigError(RuntimeError):
    pass


def _env(name: str, default: str | None = None, *, required: bool = False) -> str | None:
    value = os.environ.get(name, default)
    if required and not value:
        raise ConfigError(f"{name} is required")
    return value


@dataclass(frozen=True)
class AirtableIds:
    base_id: str
    catalogue_table_id: str
    design_rules_table_id: str | None
    fields: dict[str, str | None]

    @classmethod
    def load(cls, path: Path = DEFAULT_PLATFORM_SETTINGS) -> "AirtableIds":
        data = json.loads(Path(path).read_text())
        return cls(
            base_id=data["base_id"],
            catalogue_table_id=data["tables"]["master_flooring_catalogue"],
            design_rules_table_id=data["tables"].get("design_rules"),
            fields=dict(data["fields"]),
        )


@dataclass(frozen=True)
class Settings:
    airtable_token: str | None
    database_url: str | None
    supabase_url: str | None
    service_role_key: str | None
    image_batch: int = 300
    purge_days: int = 30
    watermark_overlap_minutes: int = 10
    deletion_guard_ratio: float = 0.9
    deletion_guard_min_rows: int = 1000
    github_run_id: str | None = None
    trigger: str | None = None
    ids: AirtableIds = field(default_factory=AirtableIds.load)

    @property
    def public_base_url(self) -> str:
        if not self.supabase_url:
            raise ConfigError("SUPABASE_URL is required to build image URLs")
        return f"{self.supabase_url.rstrip('/')}/storage/v1/object/public/catalogue-images"

    @classmethod
    def from_env(cls) -> "Settings":
        settings_path = Path(_env("PLATFORM_SETTINGS_PATH", str(DEFAULT_PLATFORM_SETTINGS)))
        return cls(
            airtable_token=_env("AIRTABLE_TOKEN"),
            database_url=_env("DATABASE_URL"),
            supabase_url=_env("SUPABASE_URL"),
            service_role_key=_env("SUPABASE_SERVICE_ROLE_KEY"),
            image_batch=int(_env("SYNC_IMAGE_BATCH", "300") or 300),
            purge_days=int(_env("SYNC_PURGE_DAYS", "30") or 30),
            watermark_overlap_minutes=int(_env("SYNC_WATERMARK_OVERLAP_MIN", "10") or 10),
            deletion_guard_ratio=float(_env("SYNC_DELETION_GUARD_RATIO", "0.9") or 0.9),
            deletion_guard_min_rows=int(_env("SYNC_DELETION_GUARD_MIN_ROWS", "1000") or 1000),
            github_run_id=_env("GITHUB_RUN_ID"),
            trigger=_env("SYNC_TRIGGER"),
            ids=AirtableIds.load(settings_path),
        )

    def require(self, *names: str) -> None:
        missing = [n for n in names if not getattr(self, n)]
        if missing:
            env_names = {
                "airtable_token": "AIRTABLE_TOKEN",
                "database_url": "DATABASE_URL",
                "supabase_url": "SUPABASE_URL",
                "service_role_key": "SUPABASE_SERVICE_ROLE_KEY",
            }
            raise ConfigError("missing: " + ", ".join(env_names.get(n, n) for n in missing))
