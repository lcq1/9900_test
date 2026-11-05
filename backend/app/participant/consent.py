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


def require_session_consent(db: Session, session_id: str, experiment) -> None:
    """Apply the published consent gate to participant capture endpoints."""
    from fastapi import HTTPException
    from app.participant.models import ParticipantEvent

    stage = next((item for item in experiment.stages if item.get("type", "").lower() == "consent"), None)
    if stage is None:
        return
    if db.query(Consent).filter_by(session_id=session_id).first():
        return
    # Earlier installations saved signatures in the participant event timeline.
    document = [item["label"] for item in stage.get("components", []) if item.get("type") == "text"]
    for event in db.query(ParticipantEvent).filter_by(session_id=session_id, stage_id=stage["id"], type="consent"):
        detail = event.detail or {}
        if detail.get("accepted") is True and detail.get("document") == document and detail.get("record"):
            return
    raise HTTPException(status_code=403, detail="Complete the consent stage before continuing.")
