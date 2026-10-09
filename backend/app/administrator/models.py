"""Administrator platform settings ORM model."""
from __future__ import annotations

from sqlalchemy import Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PlatformSettings(Base):
    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    allow_self_registration: Mapped[bool] = mapped_column(Boolean, default=True)
    require_consent_signature: Mapped[bool] = mapped_column(Boolean, default=True)
    data_retention_days: Mapped[int] = mapped_column(Integer, default=365)
    max_session_minutes: Mapped[int] = mapped_column(Integer, default=60)
