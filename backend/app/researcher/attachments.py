"""Attachment storage helper backed by the core storage abstraction.

When OneDrive credentials are configured, attachments are uploaded there;
otherwise they land in the local ``./storage`` directory. Uploads degrade
gracefully to local storage on any remote failure.
"""

from __future__ import annotations

from app.core import storage


async def save_attachment(path: str, data: bytes) -> str:
    """Persist an attachment and return its final storage location/URL."""
    return await storage.upload(path, data)
