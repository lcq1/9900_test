from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from fastapi.responses import StreamingResponse
import json
from uuid import UUID, uuid5, NAMESPACE_URL
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
    StageSubmit,
)
from app.researcher.models import Experiment as ExperimentModel, Researcher
from app.researcher import repository as versions
from app.researcher.schemas import Experiment

from dataclasses import dataclass
from datetime import timedelta
import jwt
from fastapi import Header
from app.core import clock
from app.core.config import settings
from app.core.schemas import CamelModel

@dataclass
class ParticipantAccess:
    id: str
    experiment_id: str
    experiment_code: str
    participant_code: str
    role: str = "participant"

def issue_access(experiment, participant):
    now = clock.now()
    return jwt.encode({"sub": "participant", "kind": "participant", "experiment": experiment.id,
        "participant": participant, "iat": now, "exp": now + timedelta(minutes=settings.jwt_expire_minutes)},
        settings.jwt_secret, algorithm=settings.jwt_algorithm)

async def get_study_actor(x_participant_token: str | None = Header(default=None),
                          authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    if x_participant_token:
        try:
            claims = jwt.decode(x_participant_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm],
                                options={"require": ["exp", "kind", "experiment", "participant"]})
            if claims["kind"] != "participant" or not isinstance(claims["participant"], str):
                raise ValueError()
        except (jwt.PyJWTError, ValueError):
            raise HTTPException(status_code=401, detail="Participant access expired. Enter your codes again.")
        experiment = db.get(ExperimentModel, claims["experiment"])
        if experiment is None or experiment.status != "Live":
            raise HTTPException(status_code=403, detail="Experiment is not open for participation")
        return ParticipantAccess(experiment.owner_id, experiment.id, experiment.code, claims["participant"])
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Participant access required")
    return get_current_researcher(authorization[7:], db)

def check_participant(actor, code, participant=None):
    if isinstance(actor, ParticipantAccess) and (actor.experiment_code != code or
            (participant is not None and actor.participant_code != participant)):
        raise HTTPException(status_code=403, detail="Participant access does not match this session")


router = APIRouter(prefix="/participant", tags=["participant"])
ai_router = APIRouter(prefix="/ai", tags=["ai"])


@ai_router.get("/config")
def ai_config(stage_id: str | None = Query(default=None, alias="stageId"),
              db: Session = Depends(get_db), actor: Researcher = Depends(get_study_actor)):
    from app.core.config import settings
    from app.researcher.ai_config import get_experiment_key

    experiment_id = actor.experiment_id if isinstance(actor, ParticipantAccess) else None
    if experiment_id is None and stage_id:
        experiment_id = require_ai_stage(db, stage_id, actor).id
    key = get_experiment_key(db, experiment_id) if experiment_id else None
    try:
        ai_proxy.validate_configuration(key) if key is not None else ai_proxy.validate_configuration()
        configured = True
    except HTTPException:
        configured = False
    return {"model": settings.ai_model, "configured": configured}


@ai_router.post("/chat")
def legacy_chat(_: Researcher = Depends(get_current_researcher)):
    raise HTTPException(
        status_code=410,
        detail="Use the stage AI endpoint with content, conversationId and requestId. Client-supplied context is no longer accepted.",
    )


class ParticipantLogin(CamelModel):
    experiment_code: str
    participant_code: str


@router.post("/access")
def participant_access(payload: ParticipantLogin, db: Session = Depends(get_db)):
    participant = payload.participant_code.strip()
    experiment = svc.lookup_experiment(db, payload.experiment_code.strip(), participant)
    if experiment.status != "Live":
        raise HTTPException(status_code=403, detail="Experiment is not open for participation")
    experiment = db.query(ExperimentModel).filter_by(id=experiment.id).populate_existing().with_for_update().one()
    published = versions.ensure_baseline(db, experiment)
    from types import SimpleNamespace
    visible = SimpleNamespace(**published[-1].detail["snapshot"])
    db.commit()
    return {"token": issue_access(experiment, participant),
            "experiment": Experiment.model_validate(visible).model_dump(by_alias=True)}


class SessionStart(ParticipantLogin):
    session_id: UUID


@router.post("/sessions/start")
def start_session(payload: SessionStart, db: Session = Depends(get_db),
                  actor: Researcher = Depends(get_study_actor)):
    from app.participant.models import ParticipantSession
    check_participant(actor, payload.experiment_code, payload.participant_code)
    check_session_owner(db, payload.experiment_code, actor)
    experiment = repo.find_experiment_by_code(db, payload.experiment_code)
    experiment = db.query(ExperimentModel).filter_by(id=experiment.id).populate_existing().with_for_update().one()
    if isinstance(actor, ParticipantAccess) and experiment.status != "Live":
        raise HTTPException(status_code=403, detail="Experiment is not open for participation")
    session = db.get(ParticipantSession, str(payload.session_id))
    if session is not None:
        visible = versions.session_experiment(db, session.id, experiment, payload.participant_code)
        if session.finished_at:
            raise HTTPException(status_code=409, detail="Session is already complete")
    else:
        session = ParticipantSession(id=str(payload.session_id), experiment_code=experiment.code,
            participant_code=payload.participant_code, started_at=now_iso())
        db.add(session)
        db.flush()
        visible = versions.bind_version(db, session, experiment)
    db.commit()
    return {"sessionId": session.id, "experiment": Experiment.model_validate(visible).model_dump(by_alias=True)}


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


@router.post("/stages/{stage_id}/submit")
def submit_stage(stage_id: str, payload: StageSubmit, db: Session = Depends(get_db),
                 researcher: Researcher = Depends(get_study_actor)):
    check_participant(researcher, payload.experiment_code, payload.participant_code)
    check_session_owner(db, payload.experiment_code, researcher)
    experiment = svc.lookup_experiment(db, payload.experiment_code, payload.participant_code)
    if payload.session_id:
        experiment = versions.session_experiment(db, payload.session_id, experiment, payload.participant_code)
    elif isinstance(researcher, ParticipantAccess):
        raise HTTPException(status_code=422, detail="Start a participation session first")
    stage = next((s for s in experiment.stages if s["id"] == stage_id), None)
    if stage is None:
        raise HTTPException(status_code=404, detail="Stage not found")
    if stage.get("type", "").lower() == "consent" and not payload.consent_accepted:
        raise HTTPException(status_code=422, detail="Consent must be accepted before continuing")
    svc.validate_stage(stage, payload.answers, payload.recording)
    db.commit()
    return {"accepted": True}


@router.get("/sessions", response_model=list[ParticipantSessionResult])
def list_sessions(
    experiment_code: str | None = None,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> list[ParticipantSessionResult]:
    from app.participant.models import ParticipantSession
    query = db.query(ParticipantSession).join(ExperimentModel, ParticipantSession.experiment_code == ExperimentModel.code).filter(ExperimentModel.owner_id == researcher.id)
    if experiment_code:
        check_session_owner(db, experiment_code, researcher)
        query = query.filter(ParticipantSession.experiment_code == experiment_code)
    return [svc.get_session_result(db, session.id) for session in query.order_by(ParticipantSession.started_at.desc()).all()]



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
    researcher: Researcher = Depends(get_study_actor),
) -> ParticipantSessionResult:
    check_participant(researcher, payload.experiment_code, payload.participant_code)
    check_session_owner(db, payload.experiment_code, researcher)
    if isinstance(researcher, ParticipantAccess) and not payload.session_id:
        raise HTTPException(status_code=422, detail="Start a participation session first")
    return svc.submit_session(db, payload)


@router.get("/sessions/{session_id}/csv")
def export_session_csv(
    session_id: str,
    view: export_csv.ExportView = "answers",
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> PlainTextResponse:
    session = repo.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_owner(db, session.experiment_code, researcher)
    experiment = repo.find_experiment_by_code(db, session.experiment_code)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    csv_text = export_csv.export_experiment_csv(db, experiment, view, session_id)
    return PlainTextResponse(csv_text, media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="{session_id}_{view}.csv"'
    })


def require_ai_stage(
    db: Session, stage_id: str, researcher: Researcher
) -> ExperimentModel:
    for experiment in (
        db.query(ExperimentModel)
        .filter(ExperimentModel.owner_id == researcher.id)
        .all()
    ):
        if isinstance(researcher, ParticipantAccess) and experiment.id != researcher.experiment_id:
            continue
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


def chat_context(db, stage_id, payload, actor):
    if not payload.session_id:
        if isinstance(actor, ParticipantAccess):
            raise HTTPException(status_code=422, detail="A participation session is required")
        return require_ai_stage(db, stage_id, actor), str(payload.conversation_id)
    from app.participant.models import ParticipantSession
    session = db.get(ParticipantSession, str(payload.session_id))
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    check_participant(actor, session.experiment_code, session.participant_code)
    check_session_owner(db, session.experiment_code, actor)
    if session.finished_at:
        raise HTTPException(status_code=409, detail="Session is already complete")
    experiment = repo.find_experiment_by_code(db, session.experiment_code)
    experiment = versions.session_experiment(db, session.id, experiment, session.participant_code)
    stage = next((s for s in experiment.stages if s["id"] == stage_id), None)
    if stage is None or stage.get("type", "").lower() == "consent" or not stage.get("features", {}).get("ai"):
        raise HTTPException(status_code=403, detail="AI is not enabled for this stage")
    conversation_id = str(uuid5(NAMESPACE_URL, f"session:{session.id}:{payload.conversation_id}"))
    # Release the session row before model generation so recordings can continue.
    db.commit()
    return experiment, conversation_id


@router.post("/stages/{stage_id}/ai-stream")
def stage_chat_stream(
    stage_id: str,
    payload: StageChatRequest,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_study_actor),
):
    experiment, conversation_id = chat_context(db, stage_id, payload, researcher)
    from app.researcher.ai_config import get_experiment_key
    api_key = get_experiment_key(db, experiment.id)
    ai_proxy.make_payload(payload.content)
    prepared = repo.prepare_ai_turn(
        db,
        conversation_id=conversation_id,
        request_id=str(payload.request_id),
        content=payload.content,
        researcher_id=researcher.id,
        experiment_id=experiment.id,
        stage_id=stage_id,
    )
    if payload.session_id:
        from app.participant.models import ParticipantEvent
        link = db.query(ParticipantEvent).filter_by(session_id=str(payload.session_id), type="server.ai").all()
        if not any(e.detail.get("conversation_id") == conversation_id for e in link):
            versions.server_event(db, str(payload.session_id), "server.ai", {"conversation_id": conversation_id})
    if prepared.cached is None:
        ai_proxy.validate_configuration(api_key) if api_key is not None else ai_proxy.validate_configuration()

    async def events():
        try:
            async with aclosing(svc.generate_ai_turn(db, prepared, api_key=api_key) if api_key is not None else svc.generate_ai_turn(db, prepared)) as source:
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
    researcher: Researcher = Depends(get_study_actor),
):
    require_ai_stage(db, stage_id, researcher)
    return []


@router.post("/stages/{stage_id}/ai-messages")
async def stage_chat(
    stage_id: str,
    payload: StageChatRequest,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_study_actor),
):
    experiment, conversation_id = chat_context(db, stage_id, payload, researcher)
    from app.researcher.ai_config import get_experiment_key
    api_key = get_experiment_key(db, experiment.id)
    ai_proxy.make_payload(payload.content)
    prepared = repo.prepare_ai_turn(
        db,
        conversation_id=conversation_id,
        request_id=str(payload.request_id),
        content=payload.content,
        researcher_id=researcher.id,
        experiment_id=experiment.id,
        stage_id=stage_id,
    )
    if payload.session_id:
        from app.participant.models import ParticipantEvent
        link = db.query(ParticipantEvent).filter_by(session_id=str(payload.session_id), type="server.ai").all()
        if not any(e.detail.get("conversation_id") == conversation_id for e in link):
            versions.server_event(db, str(payload.session_id), "server.ai", {"conversation_id": conversation_id})
    if prepared.cached is None:
        ai_proxy.validate_configuration(api_key) if api_key is not None else ai_proxy.validate_configuration()
    sent = now_iso()
    parts, model = [], ""
    async with aclosing(svc.generate_ai_turn(db, prepared, api_key=api_key) if api_key is not None else svc.generate_ai_turn(db, prepared)) as source:
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
    check_participant(researcher, code)
    query = db.query(ExperimentModel).filter(ExperimentModel.code == code)
    if researcher.role != "administrator":
        query = query.filter(ExperimentModel.owner_id == researcher.id)
    experiment = query.first()
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")


@router.post("/sessions/{session_id}/recordings/{recording_id}")
async def upload_recording(
    session_id: str, recording_id: str, request: Request,
    stage_id: str, kind: str, offset: int = Query(ge=0), mime: str = "video/webm",
    db: Session = Depends(get_db), researcher: Researcher = Depends(get_study_actor),
):
    from uuid import UUID
    from app.participant.models import ParticipantSession, Recording
    from app.participant.recording import append_chunk, create_recording
    try:
        recording_id = str(UUID(recording_id))
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid recording ID")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 16 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Recording chunk is too large")
    if not data:
        raise HTTPException(status_code=422, detail="Empty recording chunk")
    session = db.query(ParticipantSession).filter_by(id=session_id).with_for_update().first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    check_participant(researcher, session.experiment_code, session.participant_code)
    check_session_owner(db, session.experiment_code, researcher)
    experiment = repo.find_experiment_by_code(db, session.experiment_code)
    experiment = versions.session_experiment(db, session.id, experiment, session.participant_code)
    stage = next((s for s in experiment.stages if s["id"] == stage_id), None)
    if kind not in ("self", "screen") or stage is None:
        raise HTTPException(status_code=422, detail="Invalid recording stage or kind")
    feature = "selfie" if kind == "self" else "screenRecording"
    if stage.get("type", "").lower() == "consent" or not (stage.get("recordingRequired") or stage.get("features", {}).get(feature)):
        raise HTTPException(status_code=403, detail="Recording is disabled for this stage")
    if session.finished_at:
        raise HTTPException(status_code=409, detail="Session is already complete")
    extension = "mp4" if mime.split(";")[0] == "video/mp4" else "webm"
    if mime.split(";")[0] not in ("video/webm", "video/mp4"):
        raise HTTPException(status_code=415, detail="Unsupported recording format")
    filename = f"{recording_id}-{kind}.{extension}"
    from app.core.storage import logical_reference
    # Keep an upload on its original root even if the preference changes mid-stream.
    existing = db.query(Recording).filter_by(session_id=session.id, filename=filename).first()
    owner = db.get(Researcher, experiment.owner_id)
    try:
        path = existing.path if existing else logical_reference(owner.storage_location if owner else None, f"recordings/{session.id}/{filename}")
    except ValueError:
        raise HTTPException(status_code=503, detail="Storage location is not configured")
    try:
        append_chunk(path, offset, bytes(data))
    except OSError:
        raise HTTPException(status_code=507, detail="Recording storage is unavailable")
    recording = db.query(Recording).filter_by(session_id=session.id, path=path).first()
    if recording is None:
        recording = create_recording(db, session_id=session.id, filename=filename, path=path)
        from app.participant.models import ParticipantEvent
        db.add(ParticipantEvent(session_id=session.id, type="recording_media", stage_id=stage_id,
            detail={"recordingId": recording.id, "kind": kind, "path": path}, timestamp=now_iso()))
    db.commit()
    return {"recordingId": recording.id, "offset": offset + len(data)}


@router.get("/sessions/{session_id}/recordings/{recording_id}")
def download_recording(session_id: str, recording_id: str, db: Session = Depends(get_db),
                       researcher: Researcher = Depends(get_current_researcher)):
    from fastapi.responses import FileResponse
    from app.core.storage import _safe_local_path
    from app.participant.models import Recording
    session = svc.get_session_result(db, session_id)
    check_session_owner(db, session.experiment_code, researcher)
    recording = db.query(Recording).filter_by(id=recording_id, session_id=session_id).first()
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    from pathlib import Path
    try:
        path = _safe_local_path(recording.path)
    except ValueError:
        raise HTTPException(status_code=503, detail="Recording storage is unavailable")
    if not Path(path).is_file():
        raise HTTPException(status_code=404, detail="Recording file not found")
    return FileResponse(path, filename=recording.filename)


@router.delete("/sessions/{session_id}/recordings/{recording_id}")
async def delete_recording(session_id: str, recording_id: str, db: Session = Depends(get_db),
                           researcher: Researcher = Depends(get_current_researcher)):
    from app.core import storage
    from app.participant.models import Recording
    session = svc.get_session_result(db, session_id)
    check_session_owner(db, session.experiment_code, researcher)
    recording = db.query(Recording).filter_by(id=recording_id, session_id=session_id).first()
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    try:
        await storage.delete(recording.path)
    except (OSError, ValueError):
        raise HTTPException(status_code=503, detail="Recording storage is unavailable")
    db.delete(recording)
    db.commit()
    return {"deleted": True}


@router.get("/sessions/{session_id}/xlsx")
def export_session_workbook(session_id: str, db: Session = Depends(get_db),
                            researcher: Researcher = Depends(get_current_researcher)):
    from fastapi.responses import Response
    session = repo.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_owner(db, session.experiment_code, researcher)
    experiment = repo.find_experiment_by_code(db, session.experiment_code)
    return Response(export_csv.export_experiment_xlsx(db, experiment), media_type=export_csv.XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{export_csv.export_filename(experiment.code)}"'})
