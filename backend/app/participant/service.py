from __future__ import annotations

from app.core import clock

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.core.models import gen_uuid
from app.participant import events as event_helpers
from app.participant import repository as repo
from app.participant import ai_proxy
from contextlib import aclosing
from app.participant.models import Answer, ParticipantEvent, ParticipantSession
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


def validate_stage(stage: dict, answers: list, recording: dict):
    values = {a.component_id: a.value for a in answers}
    missing = []
    if (stage.get("type", "").lower() != "consent"
            and stage.get("features", {}).get("screenRecording")
            and recording.get("screen") is not True):
        missing.append("Screen recording")
    if stage.get("signingMethod") == "name":
        import json
        try:
            consent = json.loads(values.get("consent", ""))
            clauses = stage.get("consentClauses", [])
            document = [c["label"] for c in stage.get("components", []) if c["type"] == "text"]
            valid = (consent.get("method") == "name" and bool(consent.get("name", "").strip())
                     and consent.get("readToEnd") is True and bool(consent.get("signedAt"))
                     and bool(clauses) and consent.get("document") == document
                     and consent.get("clauses") == [{"text": c, "accepted": True} for c in clauses])
        except (ValueError, TypeError, AttributeError):
            valid = False
        if not valid:
            missing.append("Signed consent with all required clauses")
    required = stage.get("requiredFeatures", {})
    for component in stage.get("components", []):
        kind = component["type"]
        if kind in ("text", "button"):
            continue
        feature = "signatureBox" if kind == "signature" else "attachment" if kind == "attachment" else "questionnaire"
        value = values.get(component["id"], "")
        if required.get(feature, component.get("required", False)) and not (value.strip() if isinstance(value, str) else value):
            missing.append(component["label"])
        other = component.get("otherOption")
        selected = value if isinstance(value, list) else [value]
        if other and other in selected and not str(values.get(component["id"] + ":other", "")).strip():
            missing.append(component["label"] + " (please specify)")
    if stage.get("recordingRequired") and not all(recording.get(k) is True for k in ("self", "screen")):
        missing.append("Screen and camera recording")
    if missing:
        raise HTTPException(status_code=422, detail="Required: " + ", ".join(missing))


def submit_session(
    db: Session, payload: ParticipantSessionSubmit
) -> ParticipantSessionResult:
    by_sequence = {}
    for event in payload.events:
        previous = by_sequence.get(event.seq)
        if previous is not None and previous != event:
            raise HTTPException(status_code=422, detail="Conflicting event sequence")
        by_sequence[event.seq] = event
    payload.events = [by_sequence[key] for key in sorted(by_sequence)]
    from app.researcher import repository as versions
    experiment = lookup_experiment(db, payload.experiment_code, payload.participant_code)
    if payload.session_id:
        experiment = versions.session_experiment(db, payload.session_id, experiment, payload.participant_code)
    if payload.finished_at:
        for stage in experiment.stages:
            if stage.get("type", "").lower() == "consent" and not any(event.stage_id == stage["id"] and event.type == "consent" and (event.detail or {}).get("accepted") is True for event in payload.events):
                raise HTTPException(status_code=422, detail="Consent is required to finish the experiment")
            recording = {}
            for event in payload.events:
                if event.stage_id == stage["id"] and event.type in ("recording_start", "recording_stop", "navigation"):
                    detail = event.detail or {}
                    if event.type == "navigation":
                        recording = detail.get("recording", recording)
                        break
                    recording[detail.get("kind")] = event.type == "recording_start" and detail.get("status") == "active"
            validate_stage(stage, payload.answers, recording)
    existing = db.query(ParticipantSession).filter_by(id=str(payload.session_id)).with_for_update().first() if payload.session_id else None
    if payload.session_id and (existing is None or existing.experiment_code != payload.experiment_code or existing.participant_code != payload.participant_code):
        raise HTTPException(status_code=404, detail="Session not found")
    if existing and existing.finished_at and not payload.finished_at:
        raise HTTPException(status_code=409, detail="Completed session cannot be reopened")
    session_id = existing.id if existing else gen_uuid()
    started_at = existing.started_at if existing else clock.now_iso()
    if existing:
        existing.finished_at = payload.finished_at
        db.query(ParticipantEvent).filter(ParticipantEvent.session_id == session_id, ParticipantEvent.type != "recording_media", ~ParticipantEvent.type.startswith("server.")).delete()
        db.query(Answer).filter_by(session_id=session_id).delete()
    else:
        db.add(ParticipantSession(
            id=session_id,
            experiment_code=payload.experiment_code,
            participant_code=payload.participant_code,
            started_at=started_at,
            finished_at=payload.finished_at,
        ))

    if not existing:
        db.flush()
        created_session = db.get(ParticipantSession, session_id)
        versions.bind_version(db, created_session, experiment)
    orm_events = [event_helpers.make_event_orm(session_id, ev) for ev in payload.events if ev.type != "recording_media"]
    db.add_all(orm_events)

    orm_answers = [
        Answer(
            session_id=session_id,
            component_id=answer.component_id,
            value=answer.value,
        )
        for answer in payload.answers
    ]
    db.add_all(orm_answers)
    db.commit()

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
