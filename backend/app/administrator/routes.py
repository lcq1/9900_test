"""Administrator authentication and management routes."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.schemas import ApiResponse, CurrentUser
from ..core.security import SessionIdentity, create_auth_session, require_role, set_session_cookie
from ..researcher.schemas import ExperimentRead, ResearcherRead
from .schemas import AdministratorCredentials
from .service import AdministratorService


router = APIRouter()
administrator_required = require_role("administrator")


@router.post("/auth/administrator/login", response_model=ApiResponse[CurrentUser], tags=["auth"])
def login(body: AdministratorCredentials, response: Response, db: Session = Depends(get_db)) -> ApiResponse[CurrentUser]:
    administrator = AdministratorService(db).authenticate(body.password)
    if administrator is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid sign-in information")
    auth_session = create_auth_session(db, role="administrator", subject_id=administrator.id)
    db.commit()
    set_session_cookie(response, auth_session.id)
    return ApiResponse(data=CurrentUser(id=administrator.id, role="administrator"))


@router.get("/administrator/researchers", response_model=ApiResponse[list[ResearcherRead]], tags=["administrator"])
def list_researchers(
    _: SessionIdentity = Depends(administrator_required),
    db: Session = Depends(get_db),
) -> ApiResponse[list[ResearcherRead]]:
    return ApiResponse(data=AdministratorService(db).list_researchers())


@router.get("/administrator/experiments", response_model=ApiResponse[list[ExperimentRead]], tags=["administrator"])
def list_experiments(
    _: SessionIdentity = Depends(administrator_required),
    db: Session = Depends(get_db),
) -> ApiResponse[list[ExperimentRead]]:
    return ApiResponse(data=AdministratorService(db).list_experiments())
