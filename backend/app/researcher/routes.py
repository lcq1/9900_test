"""Auth, researcher and experiment HTTP routes."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.core import clock, storage
from app.administrator.service import default_storage_location
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
    ExperimentAIKey,
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
    token = create_access_token(researcher.id, researcher.auth_version)
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
        storage_notice=payload.storage_notice,
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


@router.get("/experiments/{experiment_id}/participant-codes")
def list_participant_codes(
    experiment_id: str, db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    from app.researcher.models import StudyAccessCode

    experiment = owned_experiment(db, experiment_id, researcher)
    records = db.query(StudyAccessCode).filter_by(experiment_id=experiment.id).order_by(StudyAccessCode.code)
    return [{"code": record.code, "revoked": record.revoked} for record in records]


@router.post("/experiments/{experiment_id}/participant-codes", status_code=201)
def create_participant_code(
    experiment_id: str, db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    from app.researcher.access_codes import issue_code

    record = issue_code(db, owned_experiment(db, experiment_id, researcher))
    return {"code": record.code, "revoked": record.revoked}


@router.delete("/experiments/{experiment_id}/participant-codes/{code}", status_code=204)
def revoke_participant_code(
    experiment_id: str, code: str, db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    from app.researcher.models import StudyAccessCode

    experiment = owned_experiment(db, experiment_id, researcher)
    record = db.get(StudyAccessCode, (experiment.id, code))
    if record is None:
        raise HTTPException(status_code=404, detail="Participant code not found")
    record.revoked = True
    db.commit()


def ai_settings_status(configuration, overrides, use_common=False):
    from app.participant import ai_proxy
    from app.researcher.ai_config import AI_PARAMETERS
    with ai_proxy.use_configuration(configuration):
        try:
            ai_proxy.validate_configuration()
            configured = True
        except HTTPException:
            configured = False
    values = {name: getattr(configuration, 'ai_' + name) for name in AI_PARAMETERS if name != 'api_key'}
    result = ExperimentAIKey.model_construct(**values).model_dump(by_alias=True, exclude={'api_key', 'use_common'})
    return {**result, 'hasCustomKey': bool(overrides.get('api_key')) and not use_common,
            'hasCustomSettings': any(name in overrides for name in AI_PARAMETERS),
            'useCommon': use_common, 'configured': configured}


def ai_settings_changes(payload):
    changes = {name: value for name, value in payload.model_dump(exclude_unset=True).items()
               if name != 'api_key' and (value is not None or name in ('temperature', 'system_prompt'))}
    if payload.api_key is not None:
        key = payload.api_key.get_secret_value().strip()
        if not key or len(key) > 4096 or any(char.isspace() for char in key):
            raise HTTPException(status_code=422, detail='Enter a valid API key without whitespace (up to 4096 characters).')
        changes['api_key'] = key
    return changes


def validate_ai_settings(configuration, validate_key=True):
    from app.participant import ai_proxy
    with ai_proxy.use_configuration(configuration):
        provider = ai_proxy.get_provider()
        if validate_key and configuration.ai_api_key:
            provider.validate(configuration.ai_api_key)


@router.get('/workspace/ai-config')
def common_ai_settings(db: Session = Depends(get_db), researcher: Researcher = Depends(get_current_researcher)):
    from app.researcher.ai_config import get_experiment_config, common_scope, resolve_common_config
    return ai_settings_status(resolve_common_config(db, researcher.id), get_experiment_config(db, common_scope(researcher.id)))


async def check_ai_connection(configuration):
    from app.participant import ai_proxy

    # Use the participant transport without creating a study session or chat turn.
    with ai_proxy.use_configuration(configuration):
        async for _ in ai_proxy.stream_chat("Hi"):
            pass


@router.post('/workspace/ai-config/test', status_code=204)
async def test_common_ai_connection(
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    from app.researcher.ai_config import resolve_common_config

    await check_ai_connection(resolve_common_config(db, researcher.id))


@router.patch('/workspace/ai-config')
def update_common_ai_settings(payload: ExperimentAIKey, db: Session = Depends(get_db),
                              researcher: Researcher = Depends(get_current_researcher)):
    from app.researcher.ai_config import apply_ai_overrides, common_scope, get_experiment_config, save_common_config
    changes = ai_settings_changes(payload)
    changes.pop('use_common', None)
    overrides = get_experiment_config(db, common_scope(researcher.id))
    configuration = apply_ai_overrides({**overrides, **changes})
    validate_ai_settings(configuration)
    if changes:
        save_common_config(db, researcher.id, changes)
    return common_ai_settings(db, researcher)


@router.delete('/workspace/ai-config')
def reset_common_ai_settings(db: Session = Depends(get_db), researcher: Researcher = Depends(get_current_researcher)):
    from app.researcher.ai_config import save_common_config
    save_common_config(db, researcher.id, None)
    return common_ai_settings(db, researcher)


@router.get('/experiments/{experiment_id}/ai-key')
def experiment_ai_key(experiment_id: str, db: Session = Depends(get_db),
                      researcher: Researcher = Depends(get_current_researcher)):
    from app.researcher.ai_config import get_experiment_config, resolve_experiment_config, uses_common
    experiment = owned_experiment(db, experiment_id, researcher)
    overrides = get_experiment_config(db, experiment.id)
    return ai_settings_status(resolve_experiment_config(db, experiment.id), overrides, uses_common(overrides))


@router.post('/experiments/{experiment_id}/ai-key/test', status_code=204)
async def test_experiment_ai_connection(
    experiment_id: str,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    from app.researcher.ai_config import resolve_experiment_config

    experiment = owned_experiment(db, experiment_id, researcher)
    await check_ai_connection(resolve_experiment_config(db, experiment.id))


@router.patch('/experiments/{experiment_id}/ai-key')
def update_experiment_ai_key(experiment_id: str, payload: ExperimentAIKey,
                             db: Session = Depends(get_db),
                             researcher: Researcher = Depends(get_current_researcher)):
    from app.researcher.ai_config import (AI_PARAMETERS, apply_ai_overrides, get_experiment_config, resolve_common_config,
                                          save_experiment_config, uses_common)
    experiment = owned_experiment(db, experiment_id, researcher)
    changes = ai_settings_changes(payload)
    overrides = get_experiment_config(db, experiment.id)
    parameters = {name: value for name, value in changes.items() if name in AI_PARAMETERS}
    # Parameter edits select independent mode; source-only edits preserve saved values.
    mode = changes.get('use_common', False if parameters else uses_common(overrides))
    if mode and parameters:
        raise HTTPException(status_code=422, detail='Select independent configuration before changing experiment parameters.')
    if not mode and not any(name in overrides for name in AI_PARAMETERS):
        common = resolve_common_config(db, researcher.id)
        for name in AI_PARAMETERS:
            if name != 'api_key':
                changes.setdefault(name, getattr(common, 'ai_' + name))
    changes['use_common'] = mode
    candidate = {**overrides, **changes}
    configuration = apply_ai_overrides(candidate)
    validate_ai_settings(configuration, validate_key=bool(parameters))
    save_experiment_config(db, experiment, changes)
    return experiment_ai_key(experiment_id, db, researcher)


@router.delete('/experiments/{experiment_id}/ai-key')
def remove_experiment_ai_key(experiment_id: str, db: Session = Depends(get_db),
                             researcher: Researcher = Depends(get_current_researcher)):
    from app.researcher.ai_config import save_experiment_config
    experiment = owned_experiment(db, experiment_id, researcher)
    save_experiment_config(db, experiment, {'use_common': True})
    return experiment_ai_key(experiment_id, db, researcher)


@router.get("/workspace/storage")
def storage_settings(
    researcher: Researcher = Depends(get_current_researcher), db: Session = Depends(get_db),
):
    return {
        "location": researcher.storage_location or default_storage_location(db),
        "locations": list(storage.storage_locations()),
    }


@router.patch("/workspace/storage")
def update_storage_settings(
    payload: StorageSettings,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    try:
        storage.check_location(payload.location or default_storage_location(db))
    except ValueError:
        raise HTTPException(status_code=422, detail="Select an allowed storage location")
    except OSError:
        raise HTTPException(status_code=507, detail="Storage location is not writable or has insufficient space")
    researcher.storage_location = payload.location
    db.commit()
    return storage_settings(researcher, db)


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
    reference = storage.logical_reference(researcher.storage_location or default_storage_location(db), f"materials/{researcher.id}/{material_id}")
    # Named local roots are stable; never expose absolute paths in experiment data.
    try:
        append_chunk(reference, 0, bytes(data))
    except OSError:
        raise HTTPException(status_code=507, detail="Material storage is unavailable")
    material = {"id": material_id, "name": name, "reference": reference}
    stage.setdefault("materials", []).append(material)
    experiment.stages = stages
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
    db.commit()
    return {"deleted": True}
