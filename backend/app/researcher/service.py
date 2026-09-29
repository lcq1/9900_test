"""Researcher authentication and experiment business rules."""

import secrets
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.security import hash_secret, verify_secret
from ..participant.models import Participant, ParticipantSession
from .models import Experiment
from .repository import ExperimentRepository, ResearcherRepository, StageRepository
from .schemas import ExperimentInput, ExperimentRead, StageRead


class ResearcherService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.researchers = ResearcherRepository(db)

    @staticmethod
    def normalize_email(email: str) -> str:
        return email.strip().lower()

    def register(self, email: str, password: str):
        email = self.normalize_email(email)
        if self.researchers.get_by_email(email):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to register account")
        try:
            researcher = self.researchers.create(email=email, password_hash=hash_secret(password))
            self.db.commit()
            self.db.refresh(researcher)
            return researcher
        except IntegrityError:
            self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to register account") from None

    def authenticate(self, email: str, password: str):
        researcher = self.researchers.get_by_email(self.normalize_email(email))
        if researcher is None or researcher.status != "active" or not verify_secret(researcher.password_hash, password):
            return None
        return researcher


class ExperimentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.stages = StageRepository(db)

    @staticmethod
    def _stage_dicts(data: ExperimentInput) -> list[dict]:
        ordered = sorted(data.stages, key=lambda stage: stage.position)
        positions = [stage.position for stage in ordered]
        if positions != list(range(len(ordered))):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Stages must use contiguous positions starting at zero",
            )
        if not 1 <= len(ordered) <= 20:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="An experiment requires between 1 and 20 stages",
            )
        if any(not stage.components for stage in ordered):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Every stage requires at least one component",
            )
        return [stage.model_dump() for stage in ordered]

    def _generate_code(self) -> str:
        for _ in range(20):
            code = "EXP-" + secrets.token_hex(4).upper()
            if not self.experiments.code_exists(code):
                return code
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to generate experiment code")

    @staticmethod
    def to_read(experiment: Experiment, *, stages=None) -> ExperimentRead:
        stage_values = None
        if stages is not None:
            stage_values = [
                StageRead(
                    id=stage.id,
                    template_type=stage.template_type,
                    title=stage.title,
                    components=stage.components,
                    position=stage.position,
                    time_limit=stage.time_limit,
                    timer_end_action=stage.timer_end_action,
                    extra_time_seconds=stage.extra_time_seconds,
                    screen_recording=stage.screen_recording,
                    audio_recording=stage.audio_recording,
                    video_recording=stage.video_recording,
                    copy_paste_logging=stage.copy_paste_logging,
                    allow_back=stage.allow_back,
                    double_confirm=stage.double_confirm,
                    allow_pause=stage.allow_pause,
                    show_clock=stage.show_clock,
                    ai_enabled=stage.ai_enabled,
                )
                for stage in stages
            ]
        return ExperimentRead(
            id=experiment.id,
            name=experiment.name,
            code=experiment.code,
            status=experiment.status,
            fullscreen_mode=experiment.fullscreen_mode,
            data_storage_description=experiment.data_storage_description,
            storage_location=experiment.storage_location,
            participant_safety_information=experiment.participant_safety_information,
            created_at=experiment.created_at,
            stages=stage_values,
        )

    def list_for_researcher(self, researcher_id: UUID) -> list[ExperimentRead]:
        return [self.to_read(item) for item in self.experiments.list_by_owner(researcher_id)]

    def get_for_researcher(self, researcher_id: UUID, experiment_id: UUID) -> ExperimentRead:
        experiment = self.experiments.get(experiment_id, researcher_id, with_stages=True)
        if experiment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")
        return self.to_read(experiment, stages=experiment.stages)

    def create(self, researcher_id: UUID, data: ExperimentInput) -> ExperimentRead:
        stage_data = self._stage_dicts(data)
        try:
            experiment = self.experiments.create(
                owner_id=researcher_id,
                name=data.name,
                code=self._generate_code(),
                fullscreen_mode=data.fullscreen_mode,
                data_storage_description=data.data_storage_description,
                storage_location=data.storage_location,
                participant_safety_information=data.participant_safety_information,
            )
            if data.status is not None:
                experiment.status = data.status
            created_stages = self.stages.replace_all(experiment.id, stage_data)
            self.db.commit()
            self.db.refresh(experiment)
            return self.to_read(experiment, stages=created_stages)
        except Exception:
            self.db.rollback()
            raise

    def update(self, researcher_id: UUID, experiment_id: UUID, data: ExperimentInput) -> ExperimentRead:
        experiment = self.experiments.get(experiment_id, researcher_id, with_stages=True)
        if experiment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")
        stage_data = self._stage_dicts(data)
        session_count = self.db.scalar(
            select(func.count())
            .select_from(ParticipantSession)
            .join(Participant, ParticipantSession.participant_id == Participant.id)
            .where(Participant.experiment_id == experiment_id)
        )
        existing_stages = [
            StageRead.model_validate(item).model_dump(exclude={"id"})
            for item in sorted(experiment.stages, key=lambda item: item.position)
        ]
        if session_count and existing_stages != stage_data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Stages cannot be changed after a Participant session has started",
            )
        if experiment.status == "closed" and data.status not in {None, "closed"}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A closed experiment cannot be reopened")
        try:
            experiment.name = data.name
            experiment.fullscreen_mode = data.fullscreen_mode
            experiment.data_storage_description = data.data_storage_description
            experiment.storage_location = data.storage_location
            experiment.participant_safety_information = data.participant_safety_information
            if data.status is not None:
                experiment.status = data.status
            saved_stages = list(experiment.stages)
            if existing_stages != stage_data:
                saved_stages = self.stages.replace_all(experiment.id, stage_data)
            self.db.commit()
            self.db.refresh(experiment)
            return self.to_read(experiment, stages=saved_stages)
        except Exception:
            self.db.rollback()
            raise

    def delete(self, researcher_id: UUID, experiment_id: UUID) -> None:
        experiment = self.experiments.get(experiment_id, researcher_id)
        if experiment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")
        participant_count = self.db.scalar(
            select(func.count()).select_from(Participant).where(Participant.experiment_id == experiment_id)
        )
        if participant_count:
            experiment.status = "closed"
        else:
            self.experiments.delete(experiment)
        self.db.commit()
