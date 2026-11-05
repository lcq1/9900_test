from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from typing import Literal
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core import storage
from app.core.security import get_current_administrator, get_current_researcher
from app.core.schemas import CamelORMModel
from app.administrator import service as settings_service
from app.researcher.models import Researcher, Experiment
from app.researcher.schemas import (
    Researcher as ResearcherSchema, ResearcherCreate,
    Experiment as ExperimentSchema,
)
from app.participant.schemas import ParticipantSessionResult
from app.participant import service as participant_service
from app.participant.export_csv import ExportView, export_experiment_csv
from app.researcher.service import get_experiment_or_404
from app.researcher.repository import server_event

router = APIRouter(prefix="/admin", tags=["admin"])
workspace_router = APIRouter(prefix="/workspace", tags=["workspace"])


class PlatformSettings(CamelORMModel):
    allow_self_registration: bool
    require_consent_signature: bool
    data_retention_days: int
    max_session_minutes: int
    require_researcher_approval: bool
    default_storage_location: str | None


class PlatformSettingsUpdate(CamelORMModel):
    allow_self_registration: bool | None = None
    require_consent_signature: bool | None = None
    data_retention_days: int | None = Field(default=None, ge=1)
    max_session_minutes: int | None = Field(default=None, ge=1)
    require_researcher_approval: bool | None = None
    default_storage_location: str | None = Field(default=None, max_length=64)


@router.get("/settings", response_model=PlatformSettings)
def get_settings(
    db: Session = Depends(get_db), _: Researcher = Depends(get_current_administrator)
):
    return settings_service.get_settings(db)


@router.patch("/settings", response_model=PlatformSettings)
def update_settings(
    payload: PlatformSettingsUpdate,
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_administrator),
):
    if payload.default_storage_location is not None:
        try:
            if payload.default_storage_location not in storage.storage_locations():
                raise ValueError("Unknown platform storage location")
            storage.check_location(payload.default_storage_location)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Select a configured storage location.") from exc
        except OSError as exc:
            raise HTTPException(status_code=507, detail="The storage location is not writable.") from exc
    return settings_service.update_settings(
        db, **payload.model_dump(exclude_unset=True)
    )


@workspace_router.get("/settings", response_model=PlatformSettings)
def workspace_settings(
    db: Session = Depends(get_db), _: Researcher = Depends(get_current_researcher)
):
    return settings_service.get_settings(db)


@workspace_router.get("/members", response_model=list[ResearcherSchema])
def workspace_members(
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    if researcher.role == "administrator":
        return db.query(Researcher).order_by(Researcher.created_at).all()
    return [researcher]


@router.get("/researchers", response_model=list[ResearcherSchema])
def researchers(
    db: Session = Depends(get_db), _: Researcher = Depends(get_current_administrator)
):
    return db.query(Researcher).order_by(Researcher.created_at).all()


@router.get("/storage")
def storage_options(
    db: Session = Depends(get_db), _: Researcher = Depends(get_current_administrator),
):
    return {
        "location": settings_service.default_storage_location(db),
        "locations": list(storage.storage_locations()),
    }


@router.post("/researchers", status_code=201, response_model=ResearcherSchema)
def create_researcher(
    payload: ResearcherCreate,
    db: Session = Depends(get_db), _: Researcher = Depends(get_current_administrator),
):
    from app.researcher.service import register_researcher

    if not payload.password:
        raise HTTPException(status_code=422, detail="An initial password is required.")
    return register_researcher(db, name=payload.name, email=payload.email,
                               password=payload.password, administrator=True)


class AccountUpdate(CamelORMModel):
    status: Literal["active", "disabled"]


@router.patch("/researchers/{researcher_id}", response_model=ResearcherSchema)
def set_researcher_status(
    researcher_id: str, payload: AccountUpdate,
    db: Session = Depends(get_db), actor: Researcher = Depends(get_current_administrator),
):
    account = db.query(Researcher).filter_by(id=researcher_id).with_for_update().first()
    if account is None:
        raise HTTPException(status_code=404, detail="Researcher not found")
    if account.role == "administrator":
        raise HTTPException(status_code=409, detail="Administrator accounts cannot be disabled here.")
    if account.account_status != payload.status:
        account.account_status = payload.status
        account.auth_version += 1
        server_event(db, "platform:administration", "server.researcher_access", {
            "actor": actor.id, "researcher": account.id, "status": payload.status,
        })
        db.commit()
    return account


@router.get("/experiments", response_model=list[ExperimentSchema])
def experiments(
    db: Session = Depends(get_db), _: Researcher = Depends(get_current_administrator)
):
    return db.query(Experiment).order_by(Experiment.created).all()


@router.get("/participants", response_model=list[ParticipantSessionResult])
def participants(
    db: Session = Depends(get_db), _: Researcher = Depends(get_current_administrator)
):
    return participant_service.list_session_results(db)


@router.get("/experiments/{experiment_id}/results.csv")
def results(
    experiment_id: str,
    view: ExportView = "answers",
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_administrator),
):
    exp = get_experiment_or_404(db, experiment_id)
    return Response(
        export_experiment_csv(db, exp, view),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="experiment_{view}.csv"'
        },
    )


@router.get("/experiments/{experiment_id}/results.xlsx")
def results_workbook(experiment_id: str, db: Session = Depends(get_db), _: Researcher = Depends(get_current_administrator)):
    from app.participant.export_csv import export_experiment_xlsx, export_filename, XLSX_MIME
    exp = get_experiment_or_404(db, experiment_id)
    return Response(export_experiment_xlsx(db, exp), media_type=XLSX_MIME,
                    headers={"Content-Disposition": f'attachment; filename="{export_filename(exp.code)}"'})
