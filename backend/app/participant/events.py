from __future__ import annotations
from typing import Optional
from app.participant.models import ParticipantEvent
from app.participant.schemas import ParticipantEvent as ParticipantEventSchema


def make_event_orm(
    session_id: str,
    event: ParticipantEventSchema,
) -> ParticipantEvent:
    """Build a :class:`ParticipantEvent` ORM row from a schema event."""
    return ParticipantEvent(
        session_id=session_id,
        seq=event.seq,
        type=event.type,
        timestamp=event.timestamp,
        epoch_ms=event.epoch_ms,
        perf_ms=event.perf_ms,
        stage_id=event.stage_id,
        detail=event.detail,
    )


def make_event_orms(
    session_id: str,
    events: list[ParticipantEventSchema],
) -> list[ParticipantEvent]:
    """Build ORM rows for a batch of schema events."""
    return [make_event_orm(session_id, event) for event in events]
