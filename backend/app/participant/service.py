from __future__ import annotations

from app.core import clock

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.core.models import gen_uuid
from app.participant import events as event_helpers
from app.participant import repository as repo
from app.participant import ai_proxy
from contextlib import aclosing
from app.participant.models import Answer, ParticipantEvent
from app.participant.schemas import (
    ParticipantAnswer,
    ParticipantEvent as ParticipantEventSchema,
    ParticipantSessionResult,
    ParticipantSessionSubmit,
)
from app.researcher.models import Experiment


async def generate_ai_turn(db: Session, prepared: repo.PreparedAITurn):
    """Keep context server-side; replay retries and commit only completed turns."""
    try:
        if prepared.cached is not None:
            reply, model = prepared.cached.reply, prepared.cached.model
            db.rollback()  # Release the read/idempotency lock before replay.
            yield {"type": "delta", "text": reply, "model": model}
            yield {"type": "done", "model": model}
            return
        chunks, completion = [], None
        async with aclosing(
            ai_proxy.stream_chat(prepared.content, prepared.history)
        ) as source:
            async for event in source:
                if event["type"] == "done":
                    completion = event
                else:
                    if event["type"] == "delta":
                        chunks.append(event["text"])
                    yield event
        if completion is None:
            raise HTTPException(
                status_code=502, detail="The AI reply was interrupted. Please retry."
            )
        repo.save_ai_turn(db, prepared, "".join(chunks), completion["model"])
        yield completion
    finally:
        # Cancellation/provider failures roll back incomplete pairs and release
        # the lock. A successfully committed turn remains available on retry.
        db.rollback()


def lookup_experiment(db: Session, code: str, participant: str) -> Experiment:
    if not code or not participant or len(participant.strip()) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Participant code must be at least 3 characters",
        )
    experiment = repo.find_experiment_by_code(db, code)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


def submit_session(
    db: Session, payload: ParticipantSessionSubmit
) -> ParticipantSessionResult:
    session_id = gen_uuid()
    started_at = clock.now_iso()

    repo.create_session(
        db,
        id=session_id,
        experiment_code=payload.experiment_code,
        participant_code=payload.participant_code,
        started_at=started_at,
        finished_at=payload.finished_at,
    )

    orm_events = [event_helpers.make_event_orm(session_id, ev) for ev in payload.events]
    repo.add_events(db, orm_events)

    orm_answers = [
        Answer(
            session_id=session_id,
            component_id=answer.component_id,
            value=answer.value,
        )
        for answer in payload.answers
    ]
    repo.add_answers(db, orm_answers)

    return _build_result(
        session_id=session_id,
        experiment_code=payload.experiment_code,
        participant_code=payload.participant_code,
        started_at=started_at,
        finished_at=payload.finished_at,
        orm_events=orm_events,
        orm_answers=orm_answers,
    )


def get_session_result(db: Session, session_id: str) -> ParticipantSessionResult:
    session = repo.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return _build_result(
        session_id=session.id,
        experiment_code=session.experiment_code,
        participant_code=session.participant_code,
        started_at=session.started_at,
        finished_at=session.finished_at,
        orm_events=repo.get_events(db, session_id),
        orm_answers=repo.get_answers(db, session_id),
    )


def list_session_results(db: Session) -> list[ParticipantSessionResult]:
    results: list[ParticipantSessionResult] = []
    for session in repo.list_sessions(db):
        results.append(
            _build_result(
                session_id=session.id,
                experiment_code=session.experiment_code,
                participant_code=session.participant_code,
                started_at=session.started_at,
                finished_at=session.finished_at,
                orm_events=repo.get_events(db, session.id),
                orm_answers=repo.get_answers(db, session.id),
            )
        )
    return results


def _build_result(
    *,
    session_id: str,
    experiment_code: str,
    participant_code: str,
    started_at: str,
    finished_at: object,
    orm_events: list[ParticipantEvent],
    orm_answers: list[Answer],
) -> ParticipantSessionResult:
    return ParticipantSessionResult(
        id=session_id,
        experiment_code=experiment_code,
        participant_code=participant_code,
        started_at=started_at,
        finished_at=finished_at,  # type: ignore[arg-type]
        answers=[
            ParticipantAnswer(component_id=a.component_id, value=a.value)
            for a in orm_answers
        ],
        events=[
            ParticipantEventSchema(
                seq=e.seq,
                type=e.type,
                timestamp=e.timestamp,
                epoch_ms=e.epoch_ms,
                perf_ms=e.perf_ms,
                stage_id=e.stage_id,
                detail=e.detail,
            )
            for e in orm_events
        ],
    )
