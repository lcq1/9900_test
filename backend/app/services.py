"""Business services coordinating repositories and transaction boundaries."""

from uuid import UUID

from sqlalchemy.orm import Session

from .models import Experiment
from .repositories import ExperimentRepository


class ExperimentService:
    """Enforce ownership, lifecycle and stage rules for experiments."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)

    def list_for_researcher(self, researcher_id: UUID) -> list[Experiment]:
        """Return only experiments owned by the authenticated researcher."""

        return list(self.experiments.list_by_owner(researcher_id))

    # TODO: create server-generated codes, validate stage order, and wrap all
    # create/update/delete operations in begin/commit/rollback transactions.


class ParticipantService:
    """Coordinate consent, stage access, answers and progress atomically."""

    # TODO: save an answer and advance the participant session in one transaction.


class FileService:
    """Validate upload type/size/ownership before issuing short-lived URLs."""

    # TODO: delegate signing to storage.py after authorization succeeds.


class AIJobService:
    """Create asynchronous AI work and expose safe, session-scoped status."""

    # TODO: filter sensitive inputs/results and dispatch through ai_client.py.
