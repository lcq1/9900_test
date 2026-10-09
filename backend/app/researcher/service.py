"""Business logic for researcher / experiment operations."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.researcher import repository as repo
from app.researcher.models import Experiment, Researcher


def register_researcher(
    db: Session, *, name: str, email: str, password: Optional[str]
) -> Researcher:
    if repo.get_researcher_by_email(db, email):
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    password_hash = hash_password(password) if password else ""
    return repo.create_researcher(db, name=name, email=email, password_hash=password_hash)


def authenticate(db: Session, email: str, password: str) -> Optional[Researcher]:
    researcher = repo.get_researcher_by_email(db, email)
    if researcher is None or not researcher.password_hash:
        return None
    if not verify_password(password, researcher.password_hash):
        return None
    return researcher


def list_researchers(db: Session) -> list[Researcher]:
    return repo.list_researchers(db)


def promote(db: Session, researcher_id: str) -> Researcher:
    researcher = repo.promote_researcher(db, researcher_id)
    if researcher is None:
        raise HTTPException(status_code=404, detail="Researcher not found")
    return researcher


def create_experiment(
    db: Session,
    *,
    name: str,
    code: str,
    status: str = "Draft",
    full_screen: bool = False,
    stages: Optional[list[Any]] = None,
    id: Optional[str] = None,
) -> Experiment:
    if repo.get_experiment_by_code(db, code):
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Experiment code already exists",
        )
    return repo.create_experiment(
        db,
        name=name,
        code=code,
        status=status,
        full_screen=full_screen,
        stages=stages,
        id=id,
    )


def get_experiment_or_404(db: Session, experiment_id: str) -> Experiment:
    experiment = repo.get_experiment(db, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


def list_experiments(db: Session) -> list[Experiment]:
    return repo.list_experiments(db)


def update_experiment(
    db: Session, experiment_id: str, **fields: Any
) -> Experiment:
    experiment = repo.update_experiment(db, experiment_id, **fields)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


def delete_experiment(db: Session, experiment_id: str) -> None:
    if not repo.delete_experiment(db, experiment_id):
        raise HTTPException(status_code=404, detail="Experiment not found")
