"""Storage abstraction with Microsoft Graph (OneDrive) and local fallback.

When Graph credentials are configured the upload/download go through the
Microsoft Graph API. When they are absent (default for local dev/tests) files
are written to a local ``./storage`` directory so the backend runs fully without
secrets. Any failure in the remote path degrades gracefully to local storage.
"""

from __future__ import annotations

import logging
import os

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
    normalised = os.path.normpath(path.lstrip("/"))
    if normalised.startswith("..") or os.path.isabs(normalised):
        raise ValueError("Invalid storage path")
    return os.path.join(STORAGE_DIR, normalised)


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
    return local


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
