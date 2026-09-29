"""Shared session endpoints."""

import uuid

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..administrator.service import AdministratorService
from ..participant.service import ParticipantService
from ..researcher.repository import ResearcherRepository
from .database import get_db
from .schemas import ApiResponse, CurrentUser
from .config import get_settings
from .security import AuthSession, SessionIdentity, clear_session_cookie, get_identity


router = APIRouter(tags=["auth"])


@router.get("/auth/me", response_model=ApiResponse[CurrentUser])
def current_user(
    identity: SessionIdentity = Depends(get_identity),
    db: Session = Depends(get_db),
) -> ApiResponse[CurrentUser]:
    if identity.role == "researcher":
        researcher = ResearcherRepository(db).get_by_id(identity.subject_id)
        if researcher is None or researcher.status != "active":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
        user = CurrentUser(id=researcher.id, role="researcher", email=researcher.email)
    elif identity.role == "administrator":
        user = AdministratorService(db).current_user(identity.subject_id)
    else:
        user = ParticipantService(db).current_user(identity.subject_id)
    return ApiResponse(data=user)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    session_cookie: str | None = Cookie(default=None, alias=get_settings().session_cookie_name),
    db: Session = Depends(get_db),
) -> Response:
    try:
        session_id = uuid.UUID(session_cookie) if session_cookie else None
    except ValueError:
        session_id = None
    auth_session = db.get(AuthSession, session_id) if session_id else None
    if auth_session is not None:
        db.delete(auth_session)
    db.commit()
    clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
