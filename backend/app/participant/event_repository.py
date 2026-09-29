"""Persistence boundary for ordered Participant events."""

from collections.abc import Iterable, Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Event


class EventRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def existing_sequences(self, session_id: UUID, sequences: Iterable[int]) -> set[int]:
        values = list(sequences)
        if not values:
            return set()
        statement = select(Event.client_sequence).where(
            Event.session_id == session_id,
            Event.client_sequence.in_(values),
        )
        return set(self.db.scalars(statement).all())

    def create_batch(self, events: list[dict]) -> list[Event]:
        created = [Event(**event) for event in events]
        self.db.add_all(created)
        self.db.flush()
        return created

    def list_timeline(self, session_id: UUID) -> Sequence[Event]:
        statement = (
            select(Event)
            .where(Event.session_id == session_id)
            .order_by(Event.server_timestamp, Event.client_sequence)
        )
        return self.db.scalars(statement).all()
