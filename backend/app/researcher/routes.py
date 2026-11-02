"""Auth, researcher and experiment HTTP routes."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.core import clock, storage
from app.core.config import settings
from app.core.database import get_db
from app.core.models import gen_uuid
from app.core.security import (
    create_access_token,
    get_current_researcher,
    get_current_administrator,
)
from app.participant.export_csv import ExportView, export_experiment_csv
from app.participant.models import ParticipantSession
from app.participant.recording import append_chunk
from app.researcher import service as svc
from app.researcher.models import Researcher
from app.researcher.schemas import (
    Experiment,
    ExperimentCreate,
    ExperimentUpdate,
    LoginRequest,
    LoginResponse,
    Researcher as ResearcherSchema,
    ResearcherCreate,
    StorageSettings,
)

router = APIRouter(tags=["auth", "researcher", "experiments"])


@router.post("/auth/register", response_model=ResearcherSchema, status_code=201)
def register(payload: ResearcherCreate, db: Session = Depends(get_db)) -> Researcher:
    return svc.register_researcher(
        db, name=payload.name, email=payload.email, password=payload.password
    )


@router.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    researcher = svc.authenticate(db, payload.email, payload.password)
    if researcher is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(researcher.id)
    return {
        "token": token,
        "researcher": researcher,
        "issuedAt": clock.now_iso(),
    }


@router.post("/auth/logout", status_code=200)
def logout() -> dict:
    return {"status": "ok"}


@router.get("/researchers", response_model=list[ResearcherSchema])
def list_researchers(
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_administrator),
) -> list[Researcher]:
    return svc.list_researchers(db)


@router.patch("/researchers/{researcher_id}/promote", response_model=ResearcherSchema)
def promote(
    researcher_id: str,
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_administrator),
) -> Researcher:
    return svc.promote(db, researcher_id)


@router.get("/experiments", response_model=list[Experiment])
def list_experiments(
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> list[Experiment]:
    return [exp for exp in svc.list_experiments(db) if exp.owner_id == researcher.id]


@router.get("/experiments/{experiment_id}", response_model=Experiment)
def get_experiment(
    experiment_id: str,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> Experiment:
    return owned_experiment(db, experiment_id, researcher)


@router.post("/experiments", response_model=Experiment, status_code=201)
def create_experiment(
    payload: ExperimentCreate,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> Experiment:
    stages = [stage.model_dump(by_alias=True) for stage in payload.stages]
    return svc.create_experiment(
        db,
        name=payload.name,
        owner_id=researcher.id,
        code=payload.code,
        status=payload.status,
        full_screen=payload.full_screen,
        stages=stages,
        id=payload.id,
    )


@router.patch("/experiments/{experiment_id}", response_model=Experiment)
def update_experiment(
    experiment_id: str,
    payload: ExperimentUpdate,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> Experiment:
    experiment = owned_experiment(db, experiment_id, researcher)
    fields = payload.model_dump(exclude_unset=True)
    if "code" in fields and fields["code"] != experiment.code:
        raise HTTPException(status_code=422, detail="Experiment Code cannot be changed")
    if "stages" in fields:
        fields["stages"] = [
            stage.model_dump(by_alias=True) for stage in payload.stages or []
        ]
    return svc.update_experiment(db, experiment_id, actor=researcher.id, **fields)


@router.delete("/experiments/{experiment_id}", status_code=204)
def delete_experiment(
    experiment_id: str,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> None:

    exp = owned_experiment(db, experiment_id, researcher)
    if (
        db.query(ParticipantSession)
        .filter(ParticipantSession.experiment_code == exp.code)
        .first()
    ):
        raise HTTPException(
            status_code=409,
            detail="Experiments with participant runs cannot be deleted",
        )
    svc.delete_experiment(db, experiment_id)


@router.get("/experiments/{experiment_id}/results/summary")
def results_summary(
    experiment_id: str,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):

    exp = owned_experiment(db, experiment_id, researcher)
    sessions = (
        db.query(ParticipantSession)
        .filter(ParticipantSession.experiment_code == exp.code)
        .all()
    )
    return {
        "completed_count": sum(s.finished_at is not None for s in sessions),
        "incomplete_count": sum(s.finished_at is None for s in sessions),
    }


@router.get("/experiments/{experiment_id}/results.csv")
def results_csv(
    experiment_id: str,
    view: ExportView = "answers",
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):

    exp = owned_experiment(db, experiment_id, researcher)
    return Response(
        export_experiment_csv(db, exp, view),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="experiment_{view}.csv"'
        },
    )


def owned_experiment(db: Session, experiment_id: str, researcher: Researcher):
    experiment = svc.get_experiment_or_404(db, experiment_id)
    if experiment.owner_id != researcher.id:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@router.get("/workspace/storage")
def storage_settings(researcher: Researcher = Depends(get_current_researcher)):
    return {
        "location": researcher.storage_location or settings.storage_default_location,
        "locations": list(storage.storage_locations()),
    }


@router.patch("/workspace/storage")
def update_storage_settings(
    payload: StorageSettings,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    try:
        storage.check_location(payload.location or settings.storage_default_location)
    except ValueError:
        raise HTTPException(status_code=422, detail="Select an allowed storage location")
    except OSError:
        raise HTTPException(status_code=507, detail="Storage location is not writable or has insufficient space")
    researcher.storage_location = payload.location
    db.commit()
    return storage_settings(researcher)


@router.post("/experiments/{experiment_id}/stages/{stage_id}/materials")
async def upload_material(
    experiment_id: str,
    stage_id: str,
    request: Request,
    filename: str,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    from app.researcher import repository as versions
    experiment = owned_experiment(db, experiment_id, researcher)
    experiment = db.query(type(experiment)).filter_by(id=experiment.id).populate_existing().with_for_update().one()
    if experiment.status not in ("Draft", "Live"):
        raise HTTPException(status_code=409, detail="Study materials cannot be changed in a closed experiment")
    if experiment.status == "Live":
        versions.ensure_baseline(db, experiment)
        experiment.status = "Draft"
    stages = deepcopy(experiment.stages)
    stage = next((item for item in stages if item["id"] == stage_id), None)
    if stage is None:
        raise HTTPException(status_code=404, detail="Save the stage before uploading materials")
    if stage.get("type", "").lower() == "consent":
        raise HTTPException(status_code=422, detail="Study materials are not available for consent stages")
    name = filename.replace("\\", "/").split("/")[-1][:180]
    if Path(name).suffix.lower() not in (".pdf", ".txt", ".png", ".jpg", ".jpeg", ".docx"):
        raise HTTPException(status_code=415, detail="Use PDF, text, image or Word materials")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Study materials must be at most 10 MB")
    if not data:
        raise HTTPException(status_code=422, detail="The material is empty")
    material_id = gen_uuid()
    reference = storage.logical_reference(researcher.storage_location, f"materials/{researcher.id}/{material_id}")
    # Named local roots are stable; never expose absolute paths in experiment data.
    try:
        append_chunk(reference, 0, bytes(data))
    except OSError:
        raise HTTPException(status_code=507, detail="Material storage is unavailable")
    material = {"id": material_id, "name": name, "reference": reference}
    stage.setdefault("materials", []).append(material)
    experiment.stages = stages
    published = versions.published_versions(db, experiment)
    versions.audit(db, experiment, "server.changed", {
        "actor": researcher.id, "fields": ["stages"],
        "version": published[-1].detail["version"] if published else "Draft",
        "summary": "Uploaded study material: " + name, "snapshot": versions.snapshot(experiment)})
    db.commit()
    return material


@router.get("/experiments/{experiment_id}/stages/{stage_id}/materials/{material_id}")
def download_material(
    experiment_id: str,
    stage_id: str,
    material_id: str,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    experiment = owned_experiment(db, experiment_id, researcher)
    stage = next((item for item in experiment.stages if item["id"] == stage_id), {})
    if stage.get("type", "").lower() == "consent":
        raise HTTPException(status_code=404, detail="Study material not found")
    material = next((item for item in stage.get("materials", []) if item["id"] == material_id), None)
    if material is None or material["reference"].split(":", 1)[-1] != f"materials/{researcher.id}/{material_id}":
        raise HTTPException(status_code=404, detail="Study material not found")
    return FileResponse(
        storage._safe_local_path(material["reference"]),
        filename=material["name"],
        media_type="application/octet-stream",
    )


@router.get("/experiments/{experiment_id}/results.xlsx")
def results_workbook(experiment_id: str, db: Session = Depends(get_db), researcher: Researcher = Depends(get_current_researcher)):
    from app.participant.export_csv import export_experiment_xlsx, export_filename, XLSX_MIME
    exp = owned_experiment(db, experiment_id, researcher)
    return Response(export_experiment_xlsx(db, exp), media_type=XLSX_MIME,
                    headers={"Content-Disposition": f'attachment; filename="{export_filename(exp.code)}"'})


@router.delete("/experiments/{experiment_id}/stages/{stage_id}/materials/{material_id}")
async def delete_material(
    experiment_id: str, stage_id: str, material_id: str,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    from app.researcher import repository as versions
    experiment = owned_experiment(db, experiment_id, researcher)
    experiment = db.query(type(experiment)).filter_by(id=experiment.id).populate_existing().with_for_update().one()
    if experiment.status not in ("Draft", "Live"):
        raise HTTPException(status_code=409, detail="Study materials cannot be changed in a closed experiment")
    if experiment.status == "Live":
        versions.ensure_baseline(db, experiment)
        experiment.status = "Draft"
    stages = deepcopy(experiment.stages)
    stage = next((item for item in stages if item["id"] == stage_id), {})
    material = next((item for item in stage.get("materials", []) if item["id"] == material_id), None)
    if material is None or material["reference"].split(":", 1)[-1] != f"materials/{researcher.id}/{material_id}":
        raise HTTPException(status_code=404, detail="Study material not found")
    published = versions.published_versions(db, experiment)
    # Published snapshots and ongoing sessions must retain their files.
    retained = any(item.get("reference") == material["reference"]
                   for version in published for saved_stage in version.detail["snapshot"].get("stages", [])
                   for item in saved_stage.get("materials", []))
    if not retained:
        try:
            await storage.delete(material["reference"])
        except (OSError, ValueError):
            raise HTTPException(status_code=503, detail="Material storage is unavailable")
    stage["materials"] = [item for item in stage.get("materials", []) if item["id"] != material_id]
    experiment.stages = stages
    versions.audit(db, experiment, "server.changed", {
        "actor": researcher.id, "fields": ["stages"],
        "version": published[-1].detail["version"] if published else "Draft",
        "summary": "Deleted study material: " + material["name"], "snapshot": versions.snapshot(experiment)})
    db.commit()
    return {"deleted": True}
