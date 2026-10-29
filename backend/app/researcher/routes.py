"""Auth, researcher and experiment HTTP routes."""

from __future__ import annotations

from app.core import clock


from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    get_current_researcher,
    get_current_administrator,
)
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
    return svc.update_experiment(db, experiment_id, **fields)


@router.delete("/experiments/{experiment_id}", status_code=204)
def delete_experiment(
    experiment_id: str,
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
) -> None:
    from app.participant.models import ParticipantSession

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
    from app.participant.models import ParticipantSession

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
    db: Session = Depends(get_db),
    researcher: Researcher = Depends(get_current_researcher),
):
    from fastapi.responses import Response
    from app.participant.export_csv import export_experiment_csv

    exp = owned_experiment(db, experiment_id, researcher)
    return Response(
        export_experiment_csv(db, exp),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="experiment_results.csv"'
        },
    )


def owned_experiment(db: Session, experiment_id: str, researcher: Researcher):
    experiment = svc.get_experiment_or_404(db, experiment_id)
    if experiment.owner_id != researcher.id:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment
