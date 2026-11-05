"""Storage abstraction with Microsoft Graph (OneDrive) and local fallback.

When Graph credentials are configured the upload/download go through the
Microsoft Graph API. When they are absent (default for local dev/tests) files
are written to a local ``./storage`` directory so the backend runs fully without
secrets. Any failure in the remote path degrades gracefully to local storage.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path, PurePosixPath

import httpx

from app.core.config import settings

logger = logging.getLogger("beyond.storage")

# Project root is three levels up from this file (app/core/storage.py).
_PROJECT_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
STORAGE_DIR = os.path.join(_PROJECT_ROOT, "storage")


def _safe_local_path(path: str) -> str:
    """Map a logical storage path to a safe local filesystem path."""
    location, separator, relative = path.partition(":")
    if not separator:
        location, relative = "legacy", path
    root = location_root(location)
    if not relative or "\\" in relative or ":" in relative:
        raise ValueError("Invalid storage reference")
    parts = PurePosixPath(relative)
    if parts.is_absolute() or ".." in parts.parts:
        raise ValueError("Invalid storage path")
    target = (root / relative).resolve()
    if not target.is_relative_to(root) or target == root:
        raise ValueError("Invalid storage path")
    return str(target)


def storage_locations() -> dict[str, str]:
    configured = settings.local_storage_dir.strip()
    root = Path(configured).expanduser() if configured else Path(STORAGE_DIR)
    if not root.is_absolute():
        root = Path(_PROJECT_ROOT) / root
    roots = {"legacy": str(root.resolve())}
    for name, root in settings.storage_locations.items():
        if name == "legacy" or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", name) or not Path(root).is_absolute():
            raise ValueError("Invalid server storage configuration")
        roots[name] = root
    return roots


_WORKSPACE_LOCATION = re.compile(r"workspace-([0-9a-f-]{36})-([a-z0-9][a-z0-9-]{0,16})")


def location_root(location: str) -> Path:
    roots = storage_locations()
    if location in roots:
        return Path(roots[location]).resolve()
    match = _WORKSPACE_LOCATION.fullmatch(location)
    if not match:
        raise ValueError("Unknown storage location")
    base = Path(roots["legacy"]).resolve()
    expected = base / "workspace-locations" / match[1] / match[2]
    if expected.resolve() != expected:
        raise ValueError("Invalid workspace storage directory")
    return expected


def workspace_storage_locations(owner_id: str) -> list[str]:
    prefix = f"workspace-{owner_id}-"
    parent = location_root(prefix + "example").parent
    custom = sorted(
        prefix + entry.name for entry in parent.iterdir()
        if _WORKSPACE_LOCATION.fullmatch(prefix + entry.name) and entry.is_dir() and not entry.is_symlink()
    ) if parent.is_dir() else []
    return [*storage_locations(), *custom]


def create_workspace_location(owner_id: str, name: str) -> str:
    slug = name.strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,16}", slug):
        raise ValueError("Use 1–17 letters, numbers or hyphens, starting with a letter or number.")
    location = f"workspace-{owner_id}-{slug}"
    check_location(location)
    return location


def logical_reference(location: str | None, relative: str) -> str:
    name = location or settings.storage_default_location
    reference = f"{name}:{relative}"
    _safe_local_path(reference)
    return reference


def check_location(location: str) -> None:
    import tempfile
    root = location_root(location)
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryFile(dir=root) as handle:
        handle.write(b"storage-check")
        handle.flush()


async def delete(path: str) -> None:
    Path(_safe_local_path(path)).unlink(missing_ok=True)



def _graph_configured() -> bool:
    return bool(
        settings.onedrive_client_id
        and settings.onedrive_client_secret
        and settings.onedrive_tenant_id
    )


async def upload(path: str, data: bytes) -> str:
    """Upload ``data`` to ``path``; return the final location/URL."""
    if _graph_configured():
        try:
            return await _upload_graph(path, data)
        except Exception as exc:  # pragma: no cover - degrade gracefully
            logger.warning("OneDrive upload failed, using local fallback: %s", exc)
    local = _safe_local_path(path)
    os.makedirs(os.path.dirname(local), exist_ok=True)
    with open(local, "wb") as handle:
        handle.write(data)
    return path


async def download(path: str) -> bytes:
    """Download bytes stored at ``path``."""
    if _graph_configured():
        try:
            return await _download_graph(path)
        except Exception as exc:  # pragma: no cover - degrade gracefully
            logger.warning("OneDrive download failed, using local fallback: %s", exc)
    local = _safe_local_path(path)
    with open(local, "rb") as handle:
        return handle.read()


async def _graph_token() -> str:
    token_url = (
        f"https://login.microsoftonline.com/{settings.onedrive_tenant_id}"
        "/oauth2/v2.0/token"
    )
    payload = {
        "client_id": settings.onedrive_client_id,
        "client_secret": settings.onedrive_client_secret,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(token_url, data=payload)
        resp.raise_for_status()
        return resp.json()["access_token"]


async def _upload_graph(path: str, data: bytes) -> str:
    token = await _graph_token()
    url = f"https://graph.microsoft.com/v1.0/me/drive/root:/{path}:/content"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.put(
            url, content=data, headers={"Authorization": f"Bearer {token}"}
        )
        resp.raise_for_status()
    return url


async def _download_graph(path: str) -> bytes:
    token = await _graph_token()
    url = f"https://graph.microsoft.com/v1.0/me/drive/root:/{path}:/content"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        resp.raise_for_status()
    return resp.content
