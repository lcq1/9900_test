from __future__ import annotations
from typing import Any, Optional
from sqlalchemy.orm import Session
from app.participant.models import Consent
from app.participant.time_sync import server_now_iso


def record_consent(
    db: Session,
    *,
    session_id: str,
    name: str = "",
    payload: Optional[dict[str, Any]] = None,
) -> Consent:
    """Persist a participant's consent record."""
    consent = Consent(
        session_id=session_id,
        signed_at=server_now_iso(),
        name=name,
        payload=payload or {},
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)
    return consent
