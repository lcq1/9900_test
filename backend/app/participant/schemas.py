from __future__ import annotations
from typing import Optional, Union

from pydantic import ConfigDict, Field
from uuid import UUID

from app.core.schemas import CamelModel


class ParticipantAnswer(CamelModel):
    component_id: str
    value: Union[str, list[str]]


class ParticipantEvent(CamelModel):
    seq: int
    type: str
    timestamp: str
    epoch_ms: int
    perf_ms: int
    stage_id: Optional[str] = None
    detail: Optional[dict] = None


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
    participant_code: str
    finished_at: Optional[str] = None
    answers: list[ParticipantAnswer] = []
    events: list[ParticipantEvent] = []


class StageChatRequest(CamelModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(min_length=1, max_length=20000)
    conversation_id: UUID
    request_id: UUID
