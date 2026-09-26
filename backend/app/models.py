"""All initial SQLAlchemy models described by plan.md.

The compact model module is intentional for the project's first phase. Split it
by domain when it becomes large or causes frequent merge conflicts.
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp for application-created rows."""

    return datetime.now(timezone.utc)


class TimestampMixin:
    """Common creation and update timestamps for mutable entities."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class Researcher(TimestampMixin, Base):
    """Researcher account; password_hash contains Argon2id output only."""

    __tablename__ = "researchers"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(32), default="active")


class Administrator(Base):
    """Administrator identity kept separate from researcher accounts."""

    __tablename__ = "administrators"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(128), unique=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Experiment(TimestampMixin, Base):
    """Researcher-owned experiment with a server-generated immutable code."""

    __tablename__ = "experiments"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("researchers.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    fullscreen_mode: Mapped[bool] = mapped_column(Boolean, default=False)


class Stage(TimestampMixin, Base):
    """Ordered consent, questionnaire or task configuration."""

    __tablename__ = "stages"
    __table_args__ = (UniqueConstraint("experiment_id", "position"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    experiment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("experiments.id"), index=True)
    type: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(255))
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    position: Mapped[int] = mapped_column(Integer)
    time_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Participant(Base):
    """Experiment participant; the login code is never stored in plaintext."""

    __tablename__ = "participants"
    __table_args__ = (UniqueConstraint("experiment_id", "participant_code_hash"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    experiment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("experiments.id"), index=True)
    participant_code_hash: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(32), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ParticipantSession(Base):
    """Participant login session and authoritative experiment progress."""

    __tablename__ = "participant_sessions"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    participant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("participants.id"), index=True)
    current_stage_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stages.id"), nullable=True)
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Response(Base):
    """One idempotent answer submission per participant session and stage."""

    __tablename__ = "responses"
    __table_args__ = (UniqueConstraint("session_id", "stage_id"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("participant_sessions.id"), index=True)
    stage_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stages.id"), index=True)
    answer_data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class File(Base):
    """Object-storage metadata; binary file contents never enter PostgreSQL."""

    __tablename__ = "files"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    experiment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("experiments.id"), index=True)
    storage_key: Mapped[str] = mapped_column(String(1024), unique=True)
    original_name: Mapped[str] = mapped_column(String(512))
    mime_type: Mapped[str] = mapped_column(String(255))
    size: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AIJob(Base):
    """Persisted state for long-running calls to the external AI service."""

    __tablename__ = "ai_jobs"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("participant_sessions.id"), index=True)
    stage_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stages.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    request_data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    result_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
