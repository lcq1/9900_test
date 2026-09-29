"""Persistence operations for Researcher-owned data."""

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from . import models


class ResearcherRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_email(self, email: str) -> models.Researcher | None:
        return self.db.scalar(select(models.Researcher).where(models.Researcher.email == email))

    def get_by_id(self, researcher_id: UUID) -> models.Researcher | None:
        return self.db.get(models.Researcher, researcher_id)

    def list_all(self) -> Sequence[models.Researcher]:
        return self.db.scalars(select(models.Researcher).order_by(models.Researcher.created_at.desc())).all()

    def create(self, *, email: str, password_hash: str) -> models.Researcher:
        researcher = models.Researcher(email=email, password_hash=password_hash)
        self.db.add(researcher)
        self.db.flush()
        return researcher


class ExperimentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_by_owner(self, owner_id: UUID) -> Sequence[models.Experiment]:
        statement = (
            select(models.Experiment)
            .where(models.Experiment.owner_id == owner_id)
            .order_by(models.Experiment.created_at.desc())
        )
        return self.db.scalars(statement).all()

    def list_all(self) -> Sequence[models.Experiment]:
        return self.db.scalars(select(models.Experiment).order_by(models.Experiment.created_at.desc())).all()

    def get(self, experiment_id: UUID, owner_id: UUID, *, with_stages: bool = False) -> models.Experiment | None:
        statement = select(models.Experiment).where(
            models.Experiment.id == experiment_id,
            models.Experiment.owner_id == owner_id,
        )
        if with_stages:
            statement = statement.options(selectinload(models.Experiment.stages))
        return self.db.scalar(statement)

    def get_by_id(self, experiment_id: UUID, *, with_stages: bool = False) -> models.Experiment | None:
        statement = select(models.Experiment).where(models.Experiment.id == experiment_id)
        if with_stages:
            statement = statement.options(selectinload(models.Experiment.stages))
        return self.db.scalar(statement)

    def get_by_code(self, code: str, *, with_stages: bool = False) -> models.Experiment | None:
        statement = select(models.Experiment).where(models.Experiment.code == code)
        if with_stages:
            statement = statement.options(selectinload(models.Experiment.stages))
        return self.db.scalar(statement)

    def code_exists(self, code: str) -> bool:
        return bool(self.db.scalar(select(func.count()).select_from(models.Experiment).where(models.Experiment.code == code)))

    def create(
        self,
        *,
        owner_id: UUID,
        name: str,
        code: str,
        fullscreen_mode: bool,
        data_storage_description: str,
        storage_location: str,
        participant_safety_information: str,
    ) -> models.Experiment:
        experiment = models.Experiment(
            owner_id=owner_id,
            name=name,
            code=code,
            fullscreen_mode=fullscreen_mode,
            data_storage_description=data_storage_description,
            storage_location=storage_location,
            participant_safety_information=participant_safety_information,
        )
        self.db.add(experiment)
        self.db.flush()
        return experiment

    def delete(self, experiment: models.Experiment) -> None:
        self.db.delete(experiment)


class StageRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_by_experiment(self, experiment_id: UUID) -> Sequence[models.Stage]:
        statement = (
            select(models.Stage)
            .where(models.Stage.experiment_id == experiment_id)
            .order_by(models.Stage.position)
        )
        return self.db.scalars(statement).all()

    def replace_all(self, experiment_id: UUID, stages: list[dict]) -> list[models.Stage]:
        self.db.execute(delete(models.Stage).where(models.Stage.experiment_id == experiment_id))
        created = [models.Stage(experiment_id=experiment_id, **stage) for stage in stages]
        self.db.add_all(created)
        self.db.flush()
        return created
