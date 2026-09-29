"""Participant execution, progress and response models."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base
from ..core.clock import utc_now


json_type = JSON().with_variant(JSONB, "postgresql")


class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = (
        UniqueConstraint("experiment_id", "participant_code_digest", name="uq_participant_experiment_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    experiment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("experiments.id", ondelete="CASCADE"), index=True)
    participant_code_digest: Mapped[str] = mapped_column(String(64))
    participant_code_hash: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(32), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ParticipantSession(Base):
    __tablename__ = "participant_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    participant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"), index=True)
    current_stage_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stages.id"), nullable=True)
    stage_progress: Mapped[dict[str, Any]] = mapped_column(json_type, default=dict)
    resume_status: Mapped[str] = mapped_column(String(32), default="not_started")
    last_saved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    stage_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Response(Base):
    __tablename__ = "responses"
    __table_args__ = (UniqueConstraint("session_id", "stage_id", name="uq_response_session_stage"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("participant_sessions.id", ondelete="CASCADE"),
        index=True,
    )
    stage_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stages.id"), index=True)
    answer_data: Mapped[dict[str, Any]] = mapped_column(json_type, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (UniqueConstraint("session_id", "client_sequence", name="uq_event_session_sequence"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("participant_sessions.id", ondelete="CASCADE"), index=True)
    stage_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stages.id"), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(json_type, default=dict)
    client_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    client_sequence: Mapped[int] = mapped_column(BigInteger)
    server_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Recording(Base):
    __tablename__ = "recordings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("participant_sessions.id", ondelete="CASCADE"), index=True)
    stage_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stages.id"), index=True)
    media_type: Mapped[str] = mapped_column(String(16))
    storage_key: Mapped[str] = mapped_column(String(1024))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_limit_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    access_level: Mapped[str] = mapped_column(String(32), default="restricted")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AIMessage(Base):
    __tablename__ = "ai_messages"
    __table_args__ = (UniqueConstraint("session_id", "stage_id", "sequence", name="uq_ai_message_sequence"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("participant_sessions.id", ondelete="CASCADE"), index=True)
    stage_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stages.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    server_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AIJob(Base):
    __tablename__ = "ai_jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("participant_sessions.id", ondelete="CASCADE"), index=True)
    stage_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stages.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    request_data: Mapped[dict[str, Any]] = mapped_column(json_type, default=dict)
    result_data: Mapped[dict[str, Any]] = mapped_column(json_type, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ExportJob(Base):
    __tablename__ = "export_jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    experiment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("experiments.id", ondelete="CASCADE"), index=True)
    participant_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("participants.id"), nullable=True)
    export_type: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    storage_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
