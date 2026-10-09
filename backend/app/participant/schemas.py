from __future__ import annotations
from typing import Optional, Union
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


class AIChatRequest(CamelModel):
    message: str
    context: Optional[str] = None


class AIChatResponse(CamelModel):
    reply: str
