"""SQLAlchemy CRUD for researchers and experiments."""

from __future__ import annotations

from typing import Any, Optional
from copy import deepcopy
from types import SimpleNamespace

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.models import gen_uuid
from app.researcher.models import Experiment, Researcher

def audit_key(experiment_id):
    from uuid import uuid5, NAMESPACE_URL
    return "exp:" + uuid5(NAMESPACE_URL, "experiment:" + experiment_id).hex


def server_event(db, session_id, kind, detail, sequence=0):
    from app.participant.models import ParticipantEvent
    from app.core.clock import now_iso
    event = ParticipantEvent(id=gen_uuid(), session_id=session_id, type=kind,
                             timestamp=now_iso(), seq=sequence, detail=deepcopy(detail))
    db.add(event)
    db.flush()
    return event


def experiment_history(db, experiment):
    from app.participant.models import ParticipantEvent
    return db.query(ParticipantEvent).filter_by(session_id=audit_key(experiment.id)).order_by(
        ParticipantEvent.seq, ParticipantEvent.timestamp, ParticipantEvent.id).all()


def snapshot(experiment):
    return deepcopy({key: getattr(experiment, key) for key in
                     ("id", "name", "code", "status", "created", "full_screen", "stages", "owner_id")})


def audit(db, experiment, kind, detail):
    history = experiment_history(db, experiment)
    return server_event(db, audit_key(experiment.id), kind, detail,
                        max((e.seq for e in history), default=0) + 1)


def published_versions(db, experiment):
    return [e for e in experiment_history(db, experiment) if e.type == "server.published"]


def ensure_baseline(db, experiment):
    versions = published_versions(db, experiment)
    if not versions and experiment.status == "Live":
        audit(db, experiment, "server.published", {
            "version": 1, "snapshot": snapshot(experiment), "baseline": True,
            "summary": "Baseline captured after version tracking was enabled; earlier history is unknown."})
        versions = published_versions(db, experiment)
    return versions


def bind_version(db, session, experiment, legacy=False):
    from app.participant.models import ParticipantEvent
    binding = db.query(ParticipantEvent).filter_by(session_id=session.id, type="server.version").first()
    if binding is None:
        # Serialize publication and session binding on the same experiment row.
        experiment = db.query(Experiment).filter_by(id=experiment.id).populate_existing().with_for_update().one()
        versions = ensure_baseline(db, experiment)
        latest = versions[-1] if versions else None
        binding = server_event(db, session.id, "server.version", {
            "version": None if legacy or latest is None else latest.detail["version"],
            "snapshot": latest.detail["snapshot"] if latest else snapshot(experiment),
            "legacy": legacy})
    return SimpleNamespace(**deepcopy(binding.detail["snapshot"]))


def session_experiment(db, session_id, experiment, participant=None):
    from app.participant.models import ParticipantSession
    session = db.query(ParticipantSession).filter_by(id=str(session_id)).with_for_update().first()
    if session is None or session.experiment_code != experiment.code or (participant is not None and session.participant_code != participant):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Session not found")
    return bind_version(db, session, experiment, legacy=True)


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
    return db.query(Researcher).filter(func.lower(Researcher.email) == email.strip().lower()).first()


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
    owner_id: Optional[str] = None,
    code: str,
    status: str = "Draft",
    full_screen: bool = False,
    stages: Optional[list[Any]] = None,
    id: Optional[str] = None,
) -> Experiment:
    experiment = Experiment(
        owner_id=owner_id,
        id=id or gen_uuid(),
        name=name,
        code=code,
        status=status,
        full_screen=full_screen,
        stages=stages or [],
    )
    db.add(experiment)
    db.flush()
    audit(db, experiment, "server.created", {"snapshot": snapshot(experiment), "actor": owner_id})
    if status == "Live":
        audit(db, experiment, "server.published", {"version": 1, "snapshot": snapshot(experiment), "baseline": False})
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
    experiment = db.query(Experiment).filter_by(id=experiment_id).populate_existing().with_for_update().first()
    if experiment is None:
        return None
    publish = fields.pop("publish", False)
    publish_request_id = fields.pop("publish_request_id", None)
    actor = fields.pop("actor", experiment.owner_id)
    if publish and publish_request_id:
        previous = next((e for e in experiment_history(db, experiment)
                         if e.type in ("server.published", "server.publish_reused")
                         and e.detail.get("request_id") == publish_request_id), None)
        if previous is not None:
            original = previous.detail["snapshot"]
            if any(value is not None and key in original and value != original[key] for key, value in fields.items()):
                from fastapi import HTTPException
                raise HTTPException(status_code=409, detail="A publish request ID cannot be reused for different settings")
            return experiment
    ensure_baseline(db, experiment)
    before = snapshot(experiment)
    for key, value in fields.items():
        if value is not None:
            setattr(experiment, key, value)
    content_changed = any(getattr(experiment, key) != before[key] for key in ("name", "stages", "full_screen"))
    if not publish and before["status"] == "Live" and content_changed and experiment.status != "Closed":
        experiment.status = "Draft"
    after = snapshot(experiment)
    changed = [key for key in after if after[key] != before[key]]
    if changed:
        published = published_versions(db, experiment)
        audit(db, experiment, "server.changed", {"actor": actor, "fields": changed,
              "version": published[-1].detail["version"] if published else "Draft",
              "summary": "Changed: " + ", ".join(changed), "snapshot": after})
    if publish:
        versions = published_versions(db, experiment)
        latest = versions[-1] if versions else None
        # Only published content creates versions; draft/status changes do not.
        new_version = latest is None or any(
            after[key] != latest.detail["snapshot"][key] for key in ("name", "stages", "full_screen")
        )
        if new_version:
            audit(db, experiment, "server.published", {"version": max((e.detail["version"] for e in versions), default=0) + 1,
                  "snapshot": after, "actor": actor, "request_id": publish_request_id, "baseline": False})
        elif publish_request_id:
            # Track retries without creating another published snapshot or sheet.
            audit(db, experiment, "server.publish_reused", {"version": latest.detail["version"],
                  "snapshot": after, "actor": actor, "request_id": publish_request_id,
                  "summary": "Published content unchanged; existing version reused."})
    db.commit()
    db.refresh(experiment)
    return experiment


def delete_experiment(db: Session, experiment_id: str) -> bool:
    experiment = db.get(Experiment, experiment_id)
    if experiment is None:
        return False
    from app.participant.models import ParticipantEvent
    db.query(ParticipantEvent).filter_by(session_id=audit_key(experiment.id)).delete()
    from app.researcher.ai_config import credential_id
    db.query(ParticipantEvent).filter_by(id=credential_id(experiment.id), type="server.ai_key").delete()
    db.delete(experiment)
    db.commit()
    return True
