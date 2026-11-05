"""Business logic for platform settings."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.administrator.models import PlatformSettings
from app.core.config import settings as deployment_settings

DEFAULTS: dict[str, Any] = {
    "allow_self_registration": True,
    "require_consent_signature": True,
    "data_retention_days": 365,
    "max_session_minutes": 60,
}


def get_settings(db: Session) -> PlatformSettings:
    settings = db.get(PlatformSettings, 1)
    if settings is None:
        settings = PlatformSettings(id=1, **DEFAULTS)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def update_settings(db: Session, **fields: Any) -> PlatformSettings:
    settings = get_settings(db)
    for key, value in fields.items():
        if value is not None:
            setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings


def default_storage_location(db: Session) -> str:
    policy = db.get(PlatformSettings, 1)
    return (policy.default_storage_location if policy else None) or deployment_settings.storage_default_location
