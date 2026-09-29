"""Researcher-owned experiment configuration models."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base
from ..core.clock import utc_now


json_type = JSON().with_variant(JSONB, "postgresql")


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class Researcher(TimestampMixin, Base):
    __tablename__ = "researchers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(32), default="active")
    experiments: Mapped[list["Experiment"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Experiment(TimestampMixin, Base):
    __tablename__ = "experiments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("researchers.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    code: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    fullscreen_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    data_storage_description: Mapped[str] = mapped_column(Text, default="")
    storage_location: Mapped[str] = mapped_column(String(255), default="")
    participant_safety_information: Mapped[str] = mapped_column(Text, default="")
    owner: Mapped[Researcher] = relationship(back_populates="experiments")
    stages: Mapped[list["Stage"]] = relationship(
        back_populates="experiment",
        cascade="all, delete-orphan",
        order_by="Stage.position",
    )


class Stage(TimestampMixin, Base):
    __tablename__ = "stages"
    __table_args__ = (UniqueConstraint("experiment_id", "position", name="uq_stage_experiment_position"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    experiment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("experiments.id", ondelete="CASCADE"), index=True)
    template_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    components: Mapped[list[dict[str, Any]]] = mapped_column(json_type, default=list)
    position: Mapped[int] = mapped_column(Integer)
    time_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timer_end_action: Mapped[str] = mapped_column(String(32), default="next_stage")
    extra_time_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    screen_recording: Mapped[bool] = mapped_column(Boolean, default=False)
    audio_recording: Mapped[bool] = mapped_column(Boolean, default=False)
    video_recording: Mapped[bool] = mapped_column(Boolean, default=False)
    copy_paste_logging: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_back: Mapped[bool] = mapped_column(Boolean, default=False)
    double_confirm: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_pause: Mapped[bool] = mapped_column(Boolean, default=False)
    show_clock: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    experiment: Mapped[Experiment] = relationship(back_populates="stages")
