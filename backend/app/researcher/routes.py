"""Auth, researcher and experiment HTTP routes."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token, get_current_researcher
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
        "issuedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/auth/logout", status_code=200)
def logout() -> dict:
    return {"status": "ok"}


@router.get("/researchers", response_model=list[ResearcherSchema])
def list_researchers(
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> list[Researcher]:
    return svc.list_researchers(db)


@router.patch("/researchers/{researcher_id}/promote", response_model=ResearcherSchema)
def promote(
    researcher_id: str,
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> Researcher:
    return svc.promote(db, researcher_id)


@router.get("/experiments", response_model=list[Experiment])
def list_experiments(
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> list[Experiment]:
    return svc.list_experiments(db)


@router.get("/experiments/{experiment_id}", response_model=Experiment)
def get_experiment(
    experiment_id: str,
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> Experiment:
    return svc.get_experiment_or_404(db, experiment_id)


@router.post("/experiments", response_model=Experiment, status_code=201)
def create_experiment(
    payload: ExperimentCreate,
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> Experiment:
    # Stages are stored verbatim (raw JSON) to preserve every researcher-authored
    # field; see the note on ExperimentCreate.stages (P0 #3).
    return svc.create_experiment(
        db,
        name=payload.name,
        code=payload.code,
        status=payload.status,
        full_screen=payload.full_screen,
        stages=payload.stages,
        id=payload.id,
    )


@router.patch("/experiments/{experiment_id}", response_model=Experiment)
def update_experiment(
    experiment_id: str,
    payload: ExperimentUpdate,
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> Experiment:
    fields = payload.model_dump(exclude_unset=True)
    # `stages` is already a raw list of dicts (verbatim) — pass it through.
    return svc.update_experiment(db, experiment_id, **fields)


@router.delete("/experiments/{experiment_id}", status_code=204)
def delete_experiment(
    experiment_id: str,
    db: Session = Depends(get_db),
    _: Researcher = Depends(get_current_researcher),
) -> None:
    svc.delete_experiment(db, experiment_id)
