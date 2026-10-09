from __future__ import annotations
from typing import Optional
from sqlalchemy.orm import Session
from app.participant.models import Answer, ParticipantEvent, ParticipantSession
from app.researcher.models import Experiment


def create_session(
    db: Session,
    *,
    id: str,
    experiment_code: str,
    participant_code: str,
    started_at: str,
    finished_at: Optional[str] = None,
) -> ParticipantSession:
    session = ParticipantSession(
        id=id,
        experiment_code=experiment_code,
        participant_code=participant_code,
        started_at=started_at,
        finished_at=finished_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: Session, session_id: str) -> Optional[ParticipantSession]:
    return db.get(ParticipantSession, session_id)


def list_sessions(db: Session) -> list[ParticipantSession]:
    return db.query(ParticipantSession).order_by(ParticipantSession.started_at).all()


def add_events(db: Session, events: list[ParticipantEvent]) -> None:
    db.add_all(events)
    db.commit()


def add_answers(db: Session, answers: list[Answer]) -> None:
    db.add_all(answers)
    db.commit()


def get_events(db: Session, session_id: str) -> list[ParticipantEvent]:
    return (
        db.query(ParticipantEvent)
        .filter(ParticipantEvent.session_id == session_id)
        .order_by(ParticipantEvent.seq)
        .all()
    )


def get_answers(db: Session, session_id: str) -> list[Answer]:
    return (
        db.query(Answer).filter(Answer.session_id == session_id).all()
    )


def find_experiment_by_code(db: Session, code: str) -> Optional[Experiment]:
    return db.query(Experiment).filter(Experiment.code.ilike(code)).first()
