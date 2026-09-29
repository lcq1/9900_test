"""Participant provisioning, login, consent, progress and answer services."""

import secrets
from datetime import timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.schemas import CurrentUser
from ..core.security import code_digest, hash_secret, utc_now, verify_secret
from ..researcher.models import Experiment, Stage
from .models import Participant, ParticipantSession, Response
from .repository import ParticipantRepository, ResponseRepository, SessionRepository
from .schemas import (
    ParticipantExperimentOverview,
    ParticipantLoginResult,
    ParticipantStageView,
    StageSubmissionResult,
)


class ParticipantService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.participants = ParticipantRepository(db)
        self.sessions = SessionRepository(db)
        self.responses = ResponseRepository(db)

    def provision(self, experiment_id: UUID, participant_code: str | None = None) -> tuple[Participant, str]:
        code = participant_code or ("P-" + secrets.token_urlsafe(8))
        digest = code_digest(code)
        if self.participants.get_by_digest(experiment_id, digest):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Participant Code already exists")
        try:
            participant = self.participants.create(
                experiment_id=experiment_id,
                participant_code_digest=digest,
                participant_code_hash=hash_secret(code),
            )
            self.db.commit()
            self.db.refresh(participant)
            return participant, code
        except IntegrityError:
            self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Participant Code already exists") from None

    def authenticate(self, experiment_code: str, participant_code: str) -> tuple[Participant, ParticipantSession] | None:
        experiment = self.db.scalar(
            select(Experiment).where(Experiment.code == experiment_code.strip().upper())
        )
        if experiment is None or experiment.status != "published":
            return None
        participant = self.participants.get_by_digest(experiment.id, code_digest(participant_code))
        if (
            participant is None
            or participant.status != "active"
            or not verify_secret(participant.participant_code_hash, participant_code)
        ):
            return None
        now = utc_now()
        participant_session = self.sessions.latest_active(participant.id, now)
        if participant_session is None:
            first_stage = self.db.scalar(
                select(Stage)
                .where(Stage.experiment_id == experiment.id)
                .order_by(Stage.position)
                .limit(1)
            )
            participant_session = self.sessions.create(
                participant_id=participant.id,
                current_stage_id=first_stage.id if first_stage else None,
                expires_at=now + timedelta(seconds=get_settings().session_ttl_seconds),
                stage_started_at=now if first_stage else None,
            )
        return participant, participant_session

    def _context(self, participant_session_id: UUID) -> tuple[ParticipantSession, Participant, Experiment]:
        participant_session = self.sessions.get(participant_session_id)
        if participant_session is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Participant session not found")
        expires_at = participant_session.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= utc_now():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Participant session has expired")
        participant = self.participants.get_by_id(participant_session.participant_id)
        if participant is None or participant.status != "active":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Participant session not found")
        experiment = self.db.get(Experiment, participant.experiment_id)
        if experiment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")
        return participant_session, participant, experiment

    def _progress(self, participant_session: ParticipantSession, experiment_id: UUID) -> int:
        total = self.db.scalar(select(func.count()).select_from(Stage).where(Stage.experiment_id == experiment_id)) or 0
        if total == 0:
            return 100
        answered = self.db.scalar(
            select(func.count()).select_from(Response).where(Response.session_id == participant_session.id)
        ) or 0
        completed = answered + (1 if participant_session.consented_at else 0)
        return min(100, round(completed * 100 / total))

    def login_result(self, participant: Participant, participant_session: ParticipantSession) -> ParticipantLoginResult:
        return ParticipantLoginResult(
            user=CurrentUser(id=participant.id, role="participant"),
            experiment_id=participant.experiment_id,
            current_stage_id=participant_session.current_stage_id,
            progress=self._progress(participant_session, participant.experiment_id),
        )

    def current_user(self, participant_session_id: UUID) -> CurrentUser:
        _, participant, _ = self._context(participant_session_id)
        return CurrentUser(id=participant.id, role="participant")

    def overview(self, participant_session_id: UUID) -> ParticipantExperimentOverview:
        participant_session, participant, experiment = self._context(participant_session_id)
        consent_stage = self.db.scalar(
            select(Stage).where(Stage.experiment_id == experiment.id, Stage.template_type == "consent")
        )
        consent_text = ""
        if consent_stage:
            consent_text = "\n".join(str(component.get("text", "")) for component in consent_stage.components)
        return ParticipantExperimentOverview(
            id=experiment.id,
            name=experiment.name,
            consent_text=consent_text,
            current_stage_id=participant_session.current_stage_id,
            progress=self._progress(participant_session, experiment.id),
            fullscreen_mode=experiment.fullscreen_mode,
        )

    def submit_consent(self, participant_session_id: UUID, accepted: bool) -> None:
        participant_session, _, experiment = self._context(participant_session_id)
        current = self.db.get(Stage, participant_session.current_stage_id) if participant_session.current_stage_id else None
        if current is None or current.experiment_id != experiment.id or current.template_type != "consent":
            if participant_session.consented_at and accepted:
                return
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Consent is not the current stage")
        now = utc_now()
        if not accepted:
            participant_session.completed_at = now
            participant_session.current_stage_id = None
            participant_session.stage_started_at = None
            participant.status = "declined"
        else:
            participant_session.consented_at = now
            next_stage = self.db.scalar(
                select(Stage)
                .where(Stage.experiment_id == experiment.id, Stage.position > current.position)
                .order_by(Stage.position)
                .limit(1)
            )
            participant_session.current_stage_id = next_stage.id if next_stage else None
            participant_session.stage_started_at = now if next_stage else None
            if next_stage is None:
                participant_session.completed_at = now
        self.db.commit()

    def get_stage(self, participant_session_id: UUID, stage_id: UUID) -> ParticipantStageView:
        participant_session, _, experiment = self._context(participant_session_id)
        if participant_session.current_stage_id != stage_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Stage is not currently available")
        stage = self.db.get(Stage, stage_id)
        if stage is None or stage.experiment_id != experiment.id or stage.template_type == "consent":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
        return ParticipantStageView(
            id=stage.id,
            title=stage.title,
            position=stage.position,
            template_type=stage.template_type,
            components=stage.components,
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

    def submit_response(
        self,
        participant_session_id: UUID,
        stage_id: UUID,
        answer_data: dict,
    ) -> StageSubmissionResult:
        participant_session, _, experiment = self._context(participant_session_id)
        existing = self.responses.get(participant_session.id, stage_id)
        if existing is not None:
            return StageSubmissionResult(next_stage_id=participant_session.current_stage_id)
        if participant_session.current_stage_id != stage_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Stage is not currently available")
        stage = self.db.get(Stage, stage_id)
        if stage is None or stage.experiment_id != experiment.id or stage.template_type == "consent":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
        now = utc_now()
        started_at = participant_session.stage_started_at or now
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        if stage.time_limit and now > started_at + timedelta(seconds=stage.time_limit):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Stage time limit has expired")
        next_stage = self.db.scalar(
            select(Stage)
            .where(Stage.experiment_id == experiment.id, Stage.position > stage.position)
            .order_by(Stage.position)
            .limit(1)
        )
        try:
            self.responses.create(
                session_id=participant_session.id,
                stage_id=stage.id,
                answer_data=answer_data,
                started_at=started_at,
            )
            participant_session.current_stage_id = next_stage.id if next_stage else None
            participant_session.stage_started_at = now if next_stage else None
            if next_stage is None:
                participant_session.completed_at = now
            self.db.commit()
            return StageSubmissionResult(next_stage_id=participant_session.current_stage_id)
        except IntegrityError:
            self.db.rollback()
            refreshed = self.sessions.get(participant_session_id)
            return StageSubmissionResult(next_stage_id=refreshed.current_stage_id if refreshed else None)


# Keep the import path stable while the implementation moves to the single-route session service.
from .session_service import ParticipantService as ParticipantService
