"""Event validation, idempotent ingestion and authoritative timestamping."""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..core.clock import utc_now
from ..researcher.models import Stage
from .event_repository import EventRepository
from .schemas import EventBatch, EventBatchResult


SENSITIVE_KEYS = {"password", "participant_code", "participantCode", "token", "secret"}


class EventService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.events = EventRepository(db)

    @staticmethod
    def _safe_payload(payload: dict) -> dict:
        return {key: value for key, value in payload.items() if key not in SENSITIVE_KEYS}

    def ingest(self, participant_session_id: UUID, experiment_id: UUID, batch: EventBatch) -> EventBatchResult:
        existing = self.events.existing_sequences(
            participant_session_id,
            (event.client_sequence for event in batch.events),
        )
        server_timestamp = utc_now()
        values: list[dict] = []
        for event in batch.events:
            if event.client_sequence in existing:
                continue
            if event.stage_id is not None:
                stage = self.db.get(Stage, event.stage_id)
                if stage is None or stage.experiment_id != experiment_id:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Event stage is not available")
            values.append(
                {
                    "session_id": participant_session_id,
                    "stage_id": event.stage_id,
                    "event_type": event.event_type,
                    "payload": self._safe_payload(event.payload),
                    "client_timestamp": event.client_timestamp,
                    "client_sequence": event.client_sequence,
                    "server_timestamp": server_timestamp,
                }
            )
        if values:
            self.events.create_batch(values)
            self.db.commit()
        return EventBatchResult(accepted=len(values), server_timestamp=server_timestamp)
