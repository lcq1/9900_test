"""Business logic for researcher / experiment operations."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.core.config import require_allowed_email
from app.core.security import hash_password, verify_password
from app.researcher import repository as repo
from app.researcher.models import Experiment, Researcher


def register_researcher(
    db: Session, *, name: str, email: str, password: Optional[str]
) -> Researcher:
    email = require_allowed_email(email)
    if repo.get_researcher_by_email(db, email):
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    password_hash = hash_password(password) if password else ""
    return repo.create_researcher(
        db, name=name, email=email, password_hash=password_hash
    )


def authenticate(db: Session, email: str, password: str) -> Optional[Researcher]:
    email = require_allowed_email(email)
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
    owner_id: Optional[str] = None,
    code: Optional[str] = None,
    status: str = "Draft",
    full_screen: bool = False,
    stages: Optional[list[Any]] = None,
    id: Optional[str] = None,
) -> Experiment:
    if status == "Live":
        validate_publication(stages or [])
    from secrets import token_hex

    code = "EXP-" + token_hex(4).upper()
    if repo.get_experiment_by_code(db, code):
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Experiment code already exists",
        )
    return repo.create_experiment(
        db,
        owner_id=owner_id,
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


def update_experiment(db: Session, experiment_id: str, **fields: Any) -> Experiment:
    current = db.query(Experiment).filter_by(id=experiment_id).populate_existing().with_for_update().first()
    if current is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    if fields.get("status") == "Live" and current.status != "Live" and not fields.get("publish"):
        raise HTTPException(status_code=422, detail="Use Publish to open this experiment for participation")
    if fields.get("publish"):
        validate_publication(fields.get("stages", current.stages))
    if fields.get("publish"):
        fields["status"] = "Live"
    experiment = repo.update_experiment(db, experiment_id, **fields)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


def delete_experiment(db: Session, experiment_id: str) -> None:
    if not repo.delete_experiment(db, experiment_id):
        raise HTTPException(status_code=404, detail="Experiment not found")


def validate_publication(stages: list[dict]) -> None:
    if not 2 <= len(stages) <= 20 or stages[0].get("type", "").lower() != "consent":
        raise HTTPException(status_code=422, detail="Publish requires a consent stage followed by at least one study stage")
    ids = [stage.get("id") for stage in stages]
    if len(set(ids)) != len(ids) or not all(ids):
        raise HTTPException(status_code=422, detail="Stage identifiers must be unique")
    for stage in stages:
        if stage.get("signingMethod") == "name" and not any(c.strip() for c in stage.get("consentClauses", [])):
            raise HTTPException(status_code=422, detail="Enter the approved consent clauses")
        if not stage.get("name", "").strip() or not stage.get("components"):
            raise HTTPException(status_code=422, detail="Each stage needs a name and study content")
        for component in stage["components"]:
            if not component.get("label", "").strip():
                raise HTTPException(status_code=422, detail="Study content cannot be blank")
            if component.get("type") in ("choice", "checkbox", "rating"):
                options = component.get("options") or []
                if not 2 <= len(options) <= 12 or any(not o.strip() for o in options) or len(set(o.strip() for o in options)) != len(options):
                    raise HTTPException(status_code=422, detail="Provide 2-12 distinct, non-empty options")
                if component.get("otherOption") and component["otherOption"] not in options:
                    raise HTTPException(status_code=422, detail="Explanation option must be a configured option")
            if component.get("type") in ("choice", "checkbox", "rating") and not component.get("options"):
                raise HTTPException(status_code=422, detail="Choice questions require options")
