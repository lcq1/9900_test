from __future__ import annotations
from typing import Optional, Union

from pydantic import ConfigDict, Field, field_validator
from uuid import UUID

from app.core.schemas import CamelModel


class ParticipantAnswer(CamelModel):
    component_id: str
    value: Union[str, list[str]]


class ParticipantEvent(CamelModel):
    seq: int = Field(ge=0)
    type: str
    timestamp: str
    epoch_ms: int = Field(ge=0)
    perf_ms: int
    stage_id: Optional[str] = None
    detail: Optional[dict] = None

    @field_validator("type")
    @classmethod
    def reject_internal_event(cls, value):
        if value.startswith("server."):
            raise ValueError("Server event types are reserved")
        return value

    @field_validator("perf_ms", mode="before")
    @classmethod
    def rounded_performance_time(cls, value):
        import math
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError("Performance time must be finite and non-negative")
        return round(value)



class ParticipantSessionResult(CamelModel):
    """Full session result returned by the API (matches frontend type)."""

    id: str
    experiment_code: str
    participant_code: str
    started_at: str
    finished_at: Optional[str] = None
    answers: list[ParticipantAnswer] = []
    events: list[ParticipantEvent] = []


class ParticipantSessionSubmit(CamelModel):
    """Body for submitting a session (server assigns id + startedAt)."""

    experiment_code: str
    session_id: Optional[UUID] = None
    participant_code: str
    finished_at: Optional[str] = None
    answers: list[ParticipantAnswer] = []
    events: list[ParticipantEvent] = []


class StageSubmit(ParticipantSessionSubmit):
    consent_accepted: bool = False
    recording: dict[str, bool] = {}


class StageChatRequest(CamelModel):
    session_id: Optional[UUID] = None
    model_config = ConfigDict(extra="forbid")
    content: str = Field(min_length=1, max_length=20000)
    conversation_id: UUID
    request_id: UUID
