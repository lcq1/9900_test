"""Participant login, single-route session, event and response schemas."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from ..core.schemas import ApiModel, CurrentUser


class ParticipantCredentials(ApiModel):
    experiment_code: str = Field(min_length=4, max_length=64)
    participant_code: str = Field(min_length=4, max_length=128)


class ParticipantLoginResult(ApiModel):
    user: CurrentUser
    experiment_id: UUID
    current_stage_id: UUID | None
    progress: int


class ParticipantExperimentOverview(ApiModel):
    id: UUID
    name: str
    consent_text: str
    current_stage_id: UUID | None
    progress: int
    fullscreen_mode: bool


class ConsentSubmission(ApiModel):
    accepted: bool


class ParticipantStageView(ApiModel):
    id: UUID
    title: str
    position: int
    template_type: str | None
    components: list[dict[str, Any]]
    time_limit: int | None
    timer_end_action: str
    extra_time_seconds: int | None
    screen_recording: bool
    audio_recording: bool
    video_recording: bool
    copy_paste_logging: bool
    allow_back: bool
    double_confirm: bool
    allow_pause: bool
    show_clock: bool
    ai_enabled: bool


class ParticipantSessionView(ApiModel):
    status: str
    experiment_id: UUID
    experiment_name: str
    fullscreen_mode: bool
    progress: int
    current_stage: ParticipantStageView | None


class ResponseSubmission(ApiModel):
    answer_data: dict[str, Any] = Field(default_factory=dict)


class StageSubmissionResult(ApiModel):
    next_stage_id: UUID | None
    status: str = "in_progress"
    current_stage: ParticipantStageView | None = None


class EventInput(ApiModel):
    stage_id: UUID | None = None
    event_type: str = Field(min_length=1, max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)
    client_timestamp: datetime
    client_sequence: int = Field(ge=0)


class EventBatch(ApiModel):
    events: list[EventInput] = Field(min_length=1, max_length=500)


class EventBatchResult(ApiModel):
    accepted: int
    server_timestamp: datetime
