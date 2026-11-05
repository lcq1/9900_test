"""Researcher and Experiment ORM models."""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlalchemy import JSON, Boolean, Integer, String, Text, ForeignKey
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
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="researcher")
    account_status: Mapped[str] = mapped_column(String(16), default="active", server_default="active")
    auth_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    storage_location: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class Experiment(Base):
    __tablename__ = "experiments"
    owner_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("researchers.id"), nullable=True, index=True
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(16), default="Draft")
    # Free-form creation date string (e.g. "26 Sep 2026").
    created: Mapped[str] = mapped_column(String(32), default=_today)
    full_screen: Mapped[bool] = mapped_column(Boolean, default=False)
    # Full list of Stage objects (nested components + features) stored as JSON.
    storage_notice: Mapped[str] = mapped_column(Text, default="", server_default="")
    stages: Mapped[list[Any]] = mapped_column(JSON, default=list)

class StudyAccessCode(Base):
    __tablename__ = "study_access_codes"

    experiment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("experiments.id", ondelete="CASCADE"), primary_key=True,
    )
    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
