from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.storage import _safe_local_path
from app.participant.models import Recording
from app.participant.time_sync import server_now_iso


def create_recording(
    db: Session,
    *,
    session_id: str,
    filename: str,
    path: str,
) -> Recording:
    """Persist metadata for a participant screen/selfie recording."""
    recording = Recording(
        session_id=session_id,
        filename=filename,
        path=path,
        created_at=server_now_iso(),
    )
    db.add(recording)
    db.flush()
    return recording


def append_chunk(path: str, offset: int, data: bytes) -> None:
    """Append ordered chunks and accept an identical retry without duplication."""
    target = Path(_safe_local_path(path))
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("r+b" if target.exists() else "w+b") as handle:
        handle.seek(0, 2)
        size = handle.tell()
        if offset < size:
            handle.seek(offset)
            if handle.read(len(data)) == data:
                return
        if offset != size:
            raise HTTPException(status_code=409, detail="Recording chunk offset mismatch")
        handle.write(data)
