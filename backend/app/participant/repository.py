from __future__ import annotations
from typing import Optional
from dataclasses import dataclass
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.participant.models import (
    Answer,
    ParticipantEvent,
    ParticipantSession,
    AIConversation,
    AIChatTurn,
)
from app.core.clock import now_iso
from app.core.config import settings
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
        .filter(ParticipantEvent.session_id == session_id, ~ParticipantEvent.type.startswith("server."))
        .order_by(ParticipantEvent.seq)
        .all()
    )


def get_answers(db: Session, session_id: str) -> list[Answer]:
    return db.query(Answer).filter(Answer.session_id == session_id).all()


def find_experiment_by_code(db: Session, code: str) -> Optional[Experiment]:
    return db.query(Experiment).filter(Experiment.code.ilike(code)).first()


@dataclass
class PreparedAITurn:
    conversation_id: str
    request_id: str
    content: str
    sequence: int
    history: list[dict]
    cached: AIChatTurn | None


def prepare_ai_turn(
    db: Session,
    *,
    conversation_id: str,
    request_id: str,
    content: str,
    researcher_id: str,
    experiment_id: str,
    stage_id: str,
) -> PreparedAITurn:
    # Hold one transaction lock through generation. A concurrent tab/request
    # receives 409 immediately instead of mixing context or generating twice.
    locked = db.execute(
        text("SELECT pg_try_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": "beyond-ai:" + conversation_id},
    ).scalar_one()
    if not locked:
        raise HTTPException(
            status_code=409,
            detail="This conversation already has a request in progress. Please retry shortly.",
        )
    conversation = db.get(AIConversation, conversation_id)
    if conversation is None:
        db.add(
            AIConversation(
                id=conversation_id,
                researcher_id=researcher_id,
                experiment_id=experiment_id,
                stage_id=stage_id,
                created_at=now_iso(),
            )
        )
        db.flush()
    elif (
        conversation.researcher_id,
        conversation.experiment_id,
        conversation.stage_id,
    ) != (researcher_id, experiment_id, stage_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    cached = (
        db.query(AIChatTurn)
        .filter_by(conversation_id=conversation_id, request_id=request_id)
        .first()
    )
    if cached and cached.prompt != content:
        raise HTTPException(
            status_code=409,
            detail="A request ID cannot be reused for a different prompt.",
        )
    latest = (
        db.query(AIChatTurn.sequence)
        .filter_by(conversation_id=conversation_id)
        .order_by(AIChatTurn.sequence.desc())
        .first()
    )
    count = (settings.ai_history_messages + 1) // 2
    turns = (
        db.query(AIChatTurn)
        .filter_by(conversation_id=conversation_id)
        .order_by(AIChatTurn.sequence.desc())
        .limit(count)
        .all()
        if count and not cached
        else []
    )
    history = []
    for turn in reversed(turns):
        history.extend(
            [
                {"role": "user", "content": turn.prompt},
                {"role": "assistant", "content": turn.reply},
            ]
        )
    return PreparedAITurn(
        conversation_id,
        request_id,
        content,
        latest[0] + 1 if latest else 1,
        history,
        cached,
    )


def save_ai_turn(db: Session, prepared: PreparedAITurn, reply: str, model: str):
    db.add(
        AIChatTurn(
            conversation_id=prepared.conversation_id,
            request_id=prepared.request_id,
            sequence=prepared.sequence,
            prompt=prepared.content,
            reply=reply,
            model=model,
            provider=settings.ai_provider,
            created_at=now_iso(),
        )
    )
    # A browser receives done only after both prompt and reply are durable.
    db.commit()
