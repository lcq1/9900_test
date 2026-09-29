"""Participant authentication, single-route session, event and compatibility routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.schemas import ApiResponse
from ..core.security import SessionIdentity, create_auth_session, require_role, set_session_cookie
from .schemas import (
    ConsentSubmission,
    EventBatch,
    EventBatchResult,
    ParticipantCredentials,
    ParticipantExperimentOverview,
    ParticipantLoginResult,
    ParticipantSessionView,
    ParticipantStageView,
    ResponseSubmission,
    StageSubmissionResult,
)
from .event_service import EventService
from .service import ParticipantService


router = APIRouter()
participant_required = require_role("participant")


@router.post("/auth/participant/login", response_model=ApiResponse[ParticipantLoginResult], tags=["auth"])
def login(body: ParticipantCredentials, response: Response, db: Session = Depends(get_db)) -> ApiResponse[ParticipantLoginResult]:
    result = ParticipantService(db).authenticate(body.experiment_code, body.participant_code)
    if result is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid sign-in information")
    participant, participant_session = result
    auth_session = create_auth_session(db, role="participant", subject_id=participant_session.id)
    db.commit()
    set_session_cookie(response, auth_session.id)
    return ApiResponse(data=ParticipantService(db).login_result(participant, participant_session))


@router.get("/participant/experiment", response_model=ApiResponse[ParticipantExperimentOverview], tags=["participant"])
def get_experiment(
    identity: SessionIdentity = Depends(participant_required),
    db: Session = Depends(get_db),
) -> ApiResponse[ParticipantExperimentOverview]:
    return ApiResponse(data=ParticipantService(db).overview(identity.subject_id))


@router.get("/participant/session", response_model=ApiResponse[ParticipantSessionView], tags=["participant"])
def get_session(
    identity: SessionIdentity = Depends(participant_required),
    db: Session = Depends(get_db),
) -> ApiResponse[ParticipantSessionView]:
    return ApiResponse(data=ParticipantService(db).current_session(identity.subject_id))


@router.post(
    "/participant/session/current-stage/responses",
    response_model=ApiResponse[StageSubmissionResult],
    tags=["participant"],
)
def submit_current_stage(
    body: ResponseSubmission,
    identity: SessionIdentity = Depends(participant_required),
    db: Session = Depends(get_db),
) -> ApiResponse[StageSubmissionResult]:
    return ApiResponse(
        data=ParticipantService(db).submit_current_stage(identity.subject_id, body.answer_data),
        message="Stage submitted",
    )


@router.post(
    "/participant/session/events/batch",
    response_model=ApiResponse[EventBatchResult],
    tags=["participant"],
)
def ingest_events(
    body: EventBatch,
    identity: SessionIdentity = Depends(participant_required),
    db: Session = Depends(get_db),
) -> ApiResponse[EventBatchResult]:
    _, _, experiment = ParticipantService(db).context(identity.subject_id)
    return ApiResponse(data=EventService(db).ingest(identity.subject_id, experiment.id, body))


@router.post("/participant/consent", response_model=ApiResponse[None], tags=["participant"])
def submit_consent(
    body: ConsentSubmission,
    identity: SessionIdentity = Depends(participant_required),
    db: Session = Depends(get_db),
) -> ApiResponse[None]:
    ParticipantService(db).submit_consent(identity.subject_id, body.accepted)
    return ApiResponse(data=None, message="Consent recorded")


@router.get("/participant/stages/{stage_id}", response_model=ApiResponse[ParticipantStageView], tags=["participant"])
def get_stage(
    stage_id: UUID,
    identity: SessionIdentity = Depends(participant_required),
    db: Session = Depends(get_db),
) -> ApiResponse[ParticipantStageView]:
    return ApiResponse(data=ParticipantService(db).get_stage(identity.subject_id, stage_id))


@router.post(
    "/participant/stages/{stage_id}/responses",
    response_model=ApiResponse[StageSubmissionResult],
    tags=["participant"],
)
def submit_response(
    stage_id: UUID,
    body: ResponseSubmission,
    identity: SessionIdentity = Depends(participant_required),
    db: Session = Depends(get_db),
) -> ApiResponse[StageSubmissionResult]:
    return ApiResponse(
        data=ParticipantService(db).submit_response(identity.subject_id, stage_id, body.answer_data),
        message="Response submitted",
    )
