"""Supabase Storage client (service role, uploads/copies/deletes only) and an in-memory fake."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Protocol

import httpx

IMMUTABLE_CACHE = "max-age=31536000, immutable"


class Storage(Protocol):
    def exists(self, bucket: str, path: str) -> bool: ...
    def upload(self, bucket: str, path: str, data: bytes, content_type: str, *, upsert: bool = False) -> None: ...
    def copy(self, bucket: str, src: str, dst: str) -> None: ...
    def remove(self, bucket: str, paths: list[str]) -> None: ...


@dataclass
class SupabaseStorage:
    base_url: str          # https://<ref>.supabase.co
    service_role_key: str
    timeout: float = 60.0
    _client: httpx.Client = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._client = httpx.Client(
            base_url=f"{self.base_url.rstrip('/')}/storage/v1",
            headers={"Authorization": f"Bearer {self.service_role_key}", "apikey": self.service_role_key},
            timeout=self.timeout,
        )

    def exists(self, bucket: str, path: str) -> bool:
        r = self._client.head(f"/object/{bucket}/{path}")
        return r.status_code == 200

    def upload(self, bucket: str, path: str, data: bytes, content_type: str, *, upsert: bool = False) -> None:
        r = self._client.post(
            f"/object/{bucket}/{path}",
            content=data,
            headers={
                "Content-Type": content_type,
                "Cache-Control": IMMUTABLE_CACHE,
                "x-upsert": "true" if upsert else "false",
            },
        )
        if r.status_code == 400 and not upsert and "already exists" in r.text.lower():
            return  # content-addressed key: same bytes, nothing to do
        r.raise_for_status()

    def copy(self, bucket: str, src: str, dst: str) -> None:
        r = self._client.post("/object/copy", json={"bucketId": bucket, "sourceKey": src, "destinationKey": dst})
        if r.status_code == 400 and "already exists" in r.text.lower():
            return
        r.raise_for_status()

    def remove(self, bucket: str, paths: list[str]) -> None:
        if not paths:
            return
        r = self._client.request("DELETE", f"/object/{bucket}", content=json.dumps({"prefixes": paths}),
                                 headers={"Content-Type": "application/json"})
        r.raise_for_status()


@dataclass
class FakeStorage:
    """In-memory stand-in with the same surface; records every call for assertions."""

    objects: dict[tuple[str, str], tuple[bytes, str]] = field(default_factory=dict)
    calls: list[tuple[str, str, str]] = field(default_factory=list)

    def exists(self, bucket: str, path: str) -> bool:
        self.calls.append(("exists", bucket, path))
        return (bucket, path) in self.objects

    def upload(self, bucket: str, path: str, data: bytes, content_type: str, *, upsert: bool = False) -> None:
        self.calls.append(("upload", bucket, path))
        if (bucket, path) in self.objects and not upsert:
            return
        self.objects[(bucket, path)] = (data, content_type)

    def copy(self, bucket: str, src: str, dst: str) -> None:
        self.calls.append(("copy", bucket, f"{src}->{dst}"))
        self.objects[(bucket, dst)] = self.objects[(bucket, src)]

    def remove(self, bucket: str, paths: list[str]) -> None:
        for p in paths:
            self.calls.append(("remove", bucket, p))
            self.objects.pop((bucket, p), None)

    def uploads(self) -> list[str]:
        return [f"{b}/{p}" for op, b, p in self.calls if op == "upload"]
