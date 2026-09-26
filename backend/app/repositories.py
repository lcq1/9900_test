"""Database access layer.

Repositories receive a SQLAlchemy Session and perform persistence only. They do
not make authentication or cross-entity business decisions.
"""

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models


class ResearcherRepository:
    """Researcher creation and identity lookup operations."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_email(self, email: str) -> models.Researcher | None:
        return self.db.scalar(select(models.Researcher).where(models.Researcher.email == email))

    def get_by_id(self, researcher_id: UUID) -> models.Researcher | None:
        return self.db.get(models.Researcher, researcher_id)

    def create(self, *, email: str, password_hash: str) -> models.Researcher:
        researcher = models.Researcher(email=email, password_hash=password_hash)
        self.db.add(researcher)
        self.db.flush()
        return researcher


class ExperimentRepository:
    """Experiment persistence with explicit owner scoping on every query."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_by_owner(self, owner_id: UUID) -> Sequence[models.Experiment]:
        statement = (
            select(models.Experiment)
            .where(models.Experiment.owner_id == owner_id)
            .order_by(models.Experiment.created_at.desc())
        )
        return self.db.scalars(statement).all()

    def get(self, experiment_id: UUID, owner_id: UUID) -> models.Experiment | None:
        statement = select(models.Experiment).where(
            models.Experiment.id == experiment_id,
            models.Experiment.owner_id == owner_id,
        )
        return self.db.scalar(statement)


class StageRepository:
    """Stage ordering and replacement operations belong here."""

    # TODO: implement list_by_experiment() and replace_all() in one transaction.


class ParticipantRepository:
    """Participant lookup and provisioning without logging raw codes."""

    # TODO: fetch candidates by experiment, then verify the supplied code hash.


class SessionRepository:
    """Role-aware server session creation, retrieval and progress updates."""

    # TODO: implement expiry checks and participant progress persistence.


class ResponseRepository:
    """Idempotent response creation and session-scoped response queries."""

    # TODO: create responses under the unique session/stage constraint.


class FileRepository:
    """Object metadata creation, retrieval and deletion."""

    # TODO: keep object deletion and metadata deletion failure-safe.


class AIJobRepository:
    """AI job lifecycle persistence without exposing provider secrets."""

    # TODO: implement atomic pending/running/completed/failed transitions.
