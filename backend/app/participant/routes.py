from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from fastapi.responses import StreamingResponse
import json
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from contextlib import aclosing
from app.core.clock import now_iso
from app.core.database import get_db
from app.core.models import gen_uuid
from app.core.security import get_current_researcher
from app.participant import ai_proxy
from app.participant import export_csv
from app.participant import repository as repo
from app.participant import service as svc
from app.participant.schemas import (
    ParticipantSessionResult,
    ParticipantSessionSubmit,
    StageChatRequest,
)
from app.researcher.models import Experiment as ExperimentModel, Researcher
from app.researcher.schemas import Experiment

router = APIRouter(prefix="/participant", tags=["participant"])
ai_router = APIRouter(prefix="/ai", tags=["ai"])


@ai_router.get("/config")
def ai_config(_: Researcher = Depends(get_current_researcher)):
    from app.core.config import settings

    return {
        "model": settings.ai_model,
        "configured": bool((settings.ai_api_key or "").strip()),
    }


@ai_router.post("/chat")
def legacy_chat(_: Researcher = Depends(get_current_researcher)):
    raise HTTPException(
        status_code=410,
        detail="Use the stage AI endpoint with content, conversationId and requestId. Client-supplied context is no longer accepted.",
    )


@router.get("/lookup", response_model=Experiment)
def lookup(
    code: str = Query(..., min_length=1),
    participant: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> Experiment:
    experiment = svc.lookup_experiment(db, code, participant)
    if experiment.owner_id != researcher.id:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@router.get("/sessions", response_model=list[ParticipantSessionResult])
def list_sessions(
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> list[ParticipantSessionResult]:
    codes = {
        e.code
        for e in db.query(ExperimentModel)
        .filter(ExperimentModel.owner_id == researcher.id)
        .all()
    }
    return [s for s in svc.list_session_results(db) if s.experiment_code in codes]


@router.get("/sessions/{session_id}", response_model=ParticipantSessionResult)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> ParticipantSessionResult:
    session = svc.get_session_result(db, session_id)
    check_session_owner(db, session.experiment_code, researcher)
    return session


@router.post("/sessions", response_model=ParticipantSessionResult, status_code=201)
def submit_session(
    payload: ParticipantSessionSubmit,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> ParticipantSessionResult:
    check_session_owner(db, payload.experiment_code, researcher)
    return svc.submit_session(db, payload)


@router.get("/sessions/{session_id}/csv")
def export_session_csv(
    session_id: str,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> PlainTextResponse:
    session = repo.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_owner(db, session.experiment_code, researcher)
    events = repo.get_events(db, session_id)
    csv_text = export_csv.export_session_csv(events)
    return PlainTextResponse(csv_text, media_type="text/csv")


def require_ai_stage(
    db: Session, stage_id: str, researcher: Researcher
) -> ExperimentModel:
    for experiment in (
        db.query(ExperimentModel)
        .filter(ExperimentModel.owner_id == researcher.id)
        .all()
    ):
        for stage in experiment.stages:
            if stage.get("id") == stage_id:
                if stage.get("type", "").lower() == "consent" or not stage.get(
                    "features", {}
                ).get("ai"):
                    raise HTTPException(
                        status_code=403, detail="AI is not enabled for this stage"
                    )
                return experiment
    raise HTTPException(status_code=404, detail="Stage not found")


@router.post("/stages/{stage_id}/ai-stream")
def stage_chat_stream(
    stage_id: str,
    payload: StageChatRequest,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    experiment = require_ai_stage(db, stage_id, researcher)
    ai_proxy.make_payload(payload.content)
    prepared = repo.prepare_ai_turn(
        db,
        conversation_id=str(payload.conversation_id),
        request_id=str(payload.request_id),
        content=payload.content,
        researcher_id=researcher.id,
        experiment_id=experiment.id,
        stage_id=stage_id,
    )
    if prepared.cached is None:
        ai_proxy.validate_configuration()

    async def events():
        try:
            async with aclosing(svc.generate_ai_turn(db, prepared)) as source:
                async for event in source:
                    yield json.dumps(
                        {**event, "server_time": now_iso()}, ensure_ascii=False
                    ) + "\n"
        except HTTPException as exc:
            yield json.dumps(
                {
                    "type": "error",
                    "message": exc.detail,
                    "retryable": exc.status_code in (429, 502, 503, 504),
                }
            ) + "\n"
        except SQLAlchemyError:
            yield json.dumps(
                {
                    "type": "error",
                    "message": "Could not save this AI reply. Please retry the same request.",
                    "retryable": True,
                }
            ) + "\n"

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.get("/stages/{stage_id}/ai-messages")
def messages(
    stage_id: str,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    require_ai_stage(db, stage_id, researcher)
    return []


@router.post("/stages/{stage_id}/ai-messages")
async def stage_chat(
    stage_id: str,
    payload: StageChatRequest,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    experiment = require_ai_stage(db, stage_id, researcher)
    ai_proxy.make_payload(payload.content)
    prepared = repo.prepare_ai_turn(
        db,
        conversation_id=str(payload.conversation_id),
        request_id=str(payload.request_id),
        content=payload.content,
        researcher_id=researcher.id,
        experiment_id=experiment.id,
        stage_id=stage_id,
    )
    if prepared.cached is None:
        ai_proxy.validate_configuration()
    sent = now_iso()
    parts, model = [], ""
    async with aclosing(svc.generate_ai_turn(db, prepared)) as source:
        async for event in source:
            if event["type"] == "delta":
                parts.append(event["text"])
            model = event.get("model", model)
    return [
        {
            "id": gen_uuid(),
            "role": "participant",
            "content": payload.content,
            "model": model,
            "server_time": sent,
        },
        {
            "id": gen_uuid(),
            "role": "assistant",
            "content": "".join(parts),
            "model": model,
            "server_time": now_iso(),
        },
    ]


def check_session_owner(db: Session, code: str, researcher: Researcher):
    query = db.query(ExperimentModel).filter(ExperimentModel.code == code)
    if researcher.role != "administrator":
        query = query.filter(ExperimentModel.owner_id == researcher.id)
    experiment = query.first()
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
