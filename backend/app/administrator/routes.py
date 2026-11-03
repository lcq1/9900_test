from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_administrator, get_current_researcher
from app.core.schemas import CamelORMModel
from app.administrator import service as settings_service
from app.researcher.models import Researcher, Experiment
from app.researcher.schemas import (
    Researcher as ResearcherSchema,
    Experiment as ExperimentSchema,
)
from app.participant.schemas import ParticipantSessionResult
from app.participant import service as participant_service
from app.participant.export_csv import ExportView, export_experiment_csv
from app.researcher.service import get_experiment_or_404

router = APIRouter(prefix="/admin", tags=["admin"])
workspace_router = APIRouter(prefix="/workspace", tags=["workspace"])


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
