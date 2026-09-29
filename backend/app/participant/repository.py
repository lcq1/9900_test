"""Persistence operations for Participant workflow data."""

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models


class ParticipantRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_digest(self, experiment_id: UUID, digest: str) -> models.Participant | None:
        statement = select(models.Participant).where(
            models.Participant.experiment_id == experiment_id,
            models.Participant.participant_code_digest == digest,
        )
        return self.db.scalar(statement)

    def get_by_id(self, participant_id: UUID) -> models.Participant | None:
        return self.db.get(models.Participant, participant_id)

    def list_by_experiment(self, experiment_id: UUID) -> Sequence[models.Participant]:
        statement = (
            select(models.Participant)
            .where(models.Participant.experiment_id == experiment_id)
            .order_by(models.Participant.created_at.desc())
        )
        return self.db.scalars(statement).all()

    def create(
        self,
        *,
        experiment_id: UUID,
        participant_code_digest: str,
        participant_code_hash: str,
    ) -> models.Participant:
        participant = models.Participant(
            experiment_id=experiment_id,
            participant_code_digest=participant_code_digest,
            participant_code_hash=participant_code_hash,
        )
        self.db.add(participant)
        self.db.flush()
        return participant


class SessionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, session_id: UUID) -> models.ParticipantSession | None:
        return self.db.get(models.ParticipantSession, session_id)

    def latest_active(self, participant_id: UUID, now: datetime) -> models.ParticipantSession | None:
        statement = (
            select(models.ParticipantSession)
            .where(
                models.ParticipantSession.participant_id == participant_id,
                models.ParticipantSession.expires_at > now,
            )
            .order_by(models.ParticipantSession.started_at.desc())
        )
        return self.db.scalar(statement)

    def create(
        self,
        *,
        participant_id: UUID,
        current_stage_id: UUID | None,
        expires_at: datetime,
        stage_started_at: datetime | None,
    ) -> models.ParticipantSession:
        session = models.ParticipantSession(
            participant_id=participant_id,
            current_stage_id=current_stage_id,
            expires_at=expires_at,
            stage_started_at=stage_started_at,
        )
        self.db.add(session)
        self.db.flush()
        return session


class ResponseRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, session_id: UUID, stage_id: UUID) -> models.Response | None:
        statement = select(models.Response).where(
            models.Response.session_id == session_id,
            models.Response.stage_id == stage_id,
        )
        return self.db.scalar(statement)

    def list_by_session(self, session_id: UUID) -> Sequence[models.Response]:
        return self.db.scalars(select(models.Response).where(models.Response.session_id == session_id)).all()

    def create(
        self,
        *,
        session_id: UUID,
        stage_id: UUID,
        answer_data: dict,
        started_at: datetime,
    ) -> models.Response:
        response = models.Response(
            session_id=session_id,
            stage_id=stage_id,
            answer_data=answer_data,
            started_at=started_at,
        )
        self.db.add(response)
        self.db.flush()
        return response
