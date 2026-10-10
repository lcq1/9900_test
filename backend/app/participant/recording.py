from __future__ import annotations
from sqlalchemy.orm import Session

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
    db.commit()
    db.refresh(recording)
    return recording
