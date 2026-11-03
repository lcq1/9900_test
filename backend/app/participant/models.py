from __future__ import annotations
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    String,
    BigInteger,
    Integer,
    Text,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import gen_uuid


class ParticipantSession(Base):
    __tablename__ = "participant_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    experiment_code: Mapped[str] = mapped_column(String(64), index=True)
    participant_code: Mapped[str] = mapped_column(String(128))
    started_at: Mapped[str] = mapped_column(String(64))  # ISO timestamp (server-set)
    finished_at: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Browser-tab lease: only the holding tab may continue an unfinished session.
    active_client_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    lease_expires_at: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class ParticipantEvent(Base):
    __tablename__ = "participant_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), index=True)
    seq: Mapped[int] = mapped_column(default=0)
    type: Mapped[str] = mapped_column(String(64))
    timestamp: Mapped[str] = mapped_column(String(64), default="")
    epoch_ms: Mapped[int] = mapped_column(BigInteger, default=0)
    perf_ms: Mapped[int] = mapped_column(default=0)
    stage_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    detail: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), index=True)
    component_id: Mapped[str] = mapped_column(String(128))
    value: Mapped[Any] = mapped_column(JSON, nullable=True)


class Consent(Base):
    __tablename__ = "consents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), index=True)
    signed_at: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(256), default="")
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Recording(Base):
    __tablename__ = "recordings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    session_id: Mapped[str] = mapped_column(String(36), index=True)
    filename: Mapped[str] = mapped_column(String(256), default="")
    path: Mapped[str] = mapped_column(String(512), default="")
    created_at: Mapped[str] = mapped_column(String(64))


class AIConversation(Base):
    __tablename__ = "ai_conversations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    researcher_id: Mapped[str] = mapped_column(
        ForeignKey("researchers.id", ondelete="CASCADE"), nullable=False
    )
    experiment_id: Mapped[str] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)


class AIChatTurn(Base):
    """Only completed prompt/reply pairs become authoritative model context."""

    __tablename__ = "ai_chat_turns"
    __table_args__ = (
        UniqueConstraint("conversation_id", "request_id", name="uq_ai_turn_request"),
        UniqueConstraint("conversation_id", "sequence", name="uq_ai_turn_sequence"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False
    )
    request_id: Mapped[str] = mapped_column(String(36), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    reply: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
