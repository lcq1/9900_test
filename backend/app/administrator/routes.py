"""Administrator platform-settings routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.administrator import service as svc
from app.core.database import get_db
from app.core.security import get_current_researcher
from app.core.schemas import CamelORMModel
from app.researcher.models import Researcher


class PlatformSettings(CamelORMModel):
    allow_self_registration: bool
    require_consent_signature: bool
    data_retention_days: int
    max_session_minutes: int


class PlatformSettingsUpdate(CamelORMModel):
    allow_self_registration: bool | None = None
    require_consent_signature: bool | None = None
    data_retention_days: int | None = None
    max_session_minutes: int | None = None


router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/settings", response_model=PlatformSettings)
def get_settings(
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> PlatformSettings:
    return svc.get_settings(db)


@router.patch("/settings", response_model=PlatformSettings)
def update_settings(
    payload: PlatformSettingsUpdate,
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> PlatformSettings:
    fields = payload.model_dump(exclude_unset=True)
    return svc.update_settings(db, **fields)
