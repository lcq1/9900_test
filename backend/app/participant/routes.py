from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_researcher
from app.participant import ai_proxy
from app.participant import export_csv
from app.participant import repository as repo
from app.participant import service as svc
from app.participant.schemas import (
    AIChatRequest,
    AIChatResponse,
    ParticipantSessionResult,
    ParticipantSessionSubmit,
)
from app.researcher.models import Researcher
from app.researcher.schemas import Experiment

router = APIRouter(prefix="/participant", tags=["participant"])
ai_router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/lookup", response_model=Experiment)
def lookup(
    code: str = Query(..., min_length=1),
    participant: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> Experiment:
    return svc.lookup_experiment(db, code, participant)


@router.get("/sessions", response_model=list[ParticipantSessionResult])
def list_sessions(
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> list[ParticipantSessionResult]:
    return svc.list_session_results(db)


@router.get("/sessions/{session_id}", response_model=ParticipantSessionResult)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> ParticipantSessionResult:
    return svc.get_session_result(db, session_id)


@router.post("/sessions", response_model=ParticipantSessionResult, status_code=201)
def submit_session(
    payload: ParticipantSessionSubmit,
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> ParticipantSessionResult:
    return svc.submit_session(db, payload)


@router.get("/sessions/{session_id}/csv")
def export_session_csv(
    session_id: str,
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> PlainTextResponse:
    session = repo.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    events = repo.get_events(db, session_id)
    csv_text = export_csv.export_session_csv(events)
    return PlainTextResponse(csv_text, media_type="text/csv")


@ai_router.post("/chat", response_model=AIChatResponse)
async def chat(payload: AIChatRequest) -> AIChatResponse:
    reply = await ai_proxy.chat(payload.message, payload.context)
    return AIChatResponse(reply=reply)
