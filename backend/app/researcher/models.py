"""Researcher and Experiment ORM models."""
from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import JSON, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, gen_uuid


def _today() -> str:
    """Return today's date formatted like ``26 Sep 2026``."""
    return date.today().strftime("%d %b %Y")


class Researcher(Base, TimestampMixin):
    __tablename__ = "researchers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="researcher")


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), default="Draft")
    # Free-form creation date string (e.g. "26 Sep 2026").
    created: Mapped[str] = mapped_column(String(32), default=_today)
    full_screen: Mapped[bool] = mapped_column(Boolean, default=False)
    # Full list of Stage objects (nested components + features) stored as JSON.
    stages: Mapped[list[Any]] = mapped_column(JSON, default=list)
