"""SQLAlchemy CRUD for researchers and experiments."""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.models import gen_uuid
from app.researcher.models import Experiment, Researcher


def create_researcher(
    db: Session,
    *,
    name: str,
    email: str,
    password_hash: str,
    role: str = "researcher",
) -> Researcher:
    researcher = Researcher(
        name=name, email=email, password_hash=password_hash, role=role
    )
    db.add(researcher)
    db.commit()
    db.refresh(researcher)
    return researcher


def get_researcher_by_email(db: Session, email: str) -> Optional[Researcher]:
    return db.query(Researcher).filter(Researcher.email == email).first()


def get_researcher(db: Session, researcher_id: str) -> Optional[Researcher]:
    return db.get(Researcher, researcher_id)


def list_researchers(db: Session) -> list[Researcher]:
    return db.query(Researcher).order_by(Researcher.created_at).all()


def promote_researcher(db: Session, researcher_id: str) -> Optional[Researcher]:
    researcher = db.get(Researcher, researcher_id)
    if researcher is None:
        return None
    researcher.role = "administrator"
    db.commit()
    db.refresh(researcher)
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
    experiment = Experiment(
        id=id or gen_uuid(),
        name=name,
        code=code,
        status=status,
        full_screen=full_screen,
        stages=stages or [],
    )
    db.add(experiment)
    db.commit()
    db.refresh(experiment)
    return experiment


def get_experiment(db: Session, experiment_id: str) -> Optional[Experiment]:
    return db.get(Experiment, experiment_id)


def get_experiment_by_code(db: Session, code: str) -> Optional[Experiment]:
    return db.query(Experiment).filter(Experiment.code.ilike(code)).first()


def list_experiments(db: Session) -> list[Experiment]:
    return db.query(Experiment).order_by(Experiment.created).all()


def update_experiment(
    db: Session, experiment_id: str, **fields: Any
) -> Optional[Experiment]:
    experiment = db.get(Experiment, experiment_id)
    if experiment is None:
        return None
    for key, value in fields.items():
        if value is not None:
            setattr(experiment, key, value)
    db.commit()
    db.refresh(experiment)
    return experiment


def delete_experiment(db: Session, experiment_id: str) -> bool:
    experiment = db.get(Experiment, experiment_id)
    if experiment is None:
        return False
    db.delete(experiment)
    db.commit()
    return True
