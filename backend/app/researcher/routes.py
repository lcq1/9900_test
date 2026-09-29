"""Researcher authentication, experiment and Participant provisioning routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.schemas import ApiResponse, CurrentUser
from ..core.security import SessionIdentity, create_auth_session, require_role, set_session_cookie
from ..participant.service import ParticipantService
from .schemas import (
    ExperimentInput,
    ExperimentRead,
    ParticipantProvision,
    ParticipantProvisioned,
    ParticipantRead,
    RegisterResult,
    ResearcherCredentials,
    ResearcherRegistration,
)
from .service import ExperimentService, ResearcherService


router = APIRouter()
researcher_required = require_role("researcher")


@router.post("/auth/researcher/register", response_model=ApiResponse[RegisterResult], status_code=201, tags=["auth"])
def register(body: ResearcherRegistration, db: Session = Depends(get_db)) -> ApiResponse[RegisterResult]:
    researcher = ResearcherService(db).register(str(body.email), body.password)
    return ApiResponse(data=RegisterResult(email=researcher.email), message="Researcher registered")


@router.post("/auth/researcher/login", response_model=ApiResponse[CurrentUser], tags=["auth"])
def login(body: ResearcherCredentials, response: Response, db: Session = Depends(get_db)) -> ApiResponse[CurrentUser]:
    researcher = ResearcherService(db).authenticate(str(body.email), body.password)
    if researcher is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid sign-in information")
    auth_session = create_auth_session(db, role="researcher", subject_id=researcher.id)
    db.commit()
    set_session_cookie(response, auth_session.id)
    return ApiResponse(data=CurrentUser(id=researcher.id, role="researcher", email=researcher.email))


@router.get("/experiments", response_model=ApiResponse[list[ExperimentRead]], tags=["experiments"])
def list_experiments(
    identity: SessionIdentity = Depends(researcher_required),
    db: Session = Depends(get_db),
) -> ApiResponse[list[ExperimentRead]]:
    return ApiResponse(data=ExperimentService(db).list_for_researcher(identity.subject_id))


@router.post("/experiments", response_model=ApiResponse[ExperimentRead], status_code=201, tags=["experiments"])
def create_experiment(
    body: ExperimentInput,
    identity: SessionIdentity = Depends(researcher_required),
    db: Session = Depends(get_db),
) -> ApiResponse[ExperimentRead]:
    return ApiResponse(data=ExperimentService(db).create(identity.subject_id, body), message="Experiment created")


@router.get("/experiments/{experiment_id}", response_model=ApiResponse[ExperimentRead], tags=["experiments"])
def get_experiment(
    experiment_id: UUID,
    identity: SessionIdentity = Depends(researcher_required),
    db: Session = Depends(get_db),
) -> ApiResponse[ExperimentRead]:
    return ApiResponse(data=ExperimentService(db).get_for_researcher(identity.subject_id, experiment_id))


@router.put("/experiments/{experiment_id}", response_model=ApiResponse[ExperimentRead], tags=["experiments"])
def update_experiment(
    experiment_id: UUID,
    body: ExperimentInput,
    identity: SessionIdentity = Depends(researcher_required),
    db: Session = Depends(get_db),
) -> ApiResponse[ExperimentRead]:
    return ApiResponse(
        data=ExperimentService(db).update(identity.subject_id, experiment_id, body),
        message="Experiment updated",
    )


@router.delete("/experiments/{experiment_id}", status_code=204, tags=["experiments"])
def delete_experiment(
    experiment_id: UUID,
    identity: SessionIdentity = Depends(researcher_required),
    db: Session = Depends(get_db),
) -> Response:
    ExperimentService(db).delete(identity.subject_id, experiment_id)
    return Response(status_code=204)


@router.post(
    "/experiments/{experiment_id}/participants",
    response_model=ApiResponse[ParticipantProvisioned],
    status_code=201,
    tags=["experiments"],
)
def provision_participant(
    experiment_id: UUID,
    body: ParticipantProvision,
    identity: SessionIdentity = Depends(researcher_required),
    db: Session = Depends(get_db),
) -> ApiResponse[ParticipantProvisioned]:
    ExperimentService(db).get_for_researcher(identity.subject_id, experiment_id)
    participant, code = ParticipantService(db).provision(experiment_id, body.participant_code)
    return ApiResponse(
        data=ParticipantProvisioned(participant_id=participant.id, participant_code=code),
        message="Participant created; store the code now because it cannot be recovered",
    )


@router.get(
    "/experiments/{experiment_id}/participants",
    response_model=ApiResponse[list[ParticipantRead]],
    tags=["experiments"],
)
def list_participants(
    experiment_id: UUID,
    identity: SessionIdentity = Depends(researcher_required),
    db: Session = Depends(get_db),
) -> ApiResponse[list[ParticipantRead]]:
    ExperimentService(db).get_for_researcher(identity.subject_id, experiment_id)
    participants = ParticipantService(db).participants.list_by_experiment(experiment_id)
    return ApiResponse(data=[ParticipantRead.model_validate(item) for item in participants])
