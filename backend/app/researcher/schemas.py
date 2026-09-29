"""Researcher authentication and experiment API schemas."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import EmailStr, Field, field_validator, model_validator

from ..core.schemas import ApiModel


class ResearcherCredentials(ApiModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class ResearcherRegistration(ResearcherCredentials):
    pass


class RegisterResult(ApiModel):
    email: EmailStr


class ResearcherRead(ApiModel):
    id: UUID
    email: EmailStr
    status: str
    created_at: datetime


class StageInput(ApiModel):
    template_type: Literal["consent", "questionnaire", "task", "static"] | None = None
    title: str = Field(min_length=1, max_length=255)
    components: list[dict[str, Any]] = Field(default_factory=list)
    position: int = Field(ge=0)
    time_limit: int | None = Field(default=None, ge=1, le=86_400)
    timer_end_action: Literal["next_stage", "offer_extra_time"] = "next_stage"
    extra_time_seconds: int | None = Field(default=None, ge=1, le=86_400)
    screen_recording: bool = False
    audio_recording: bool = False
    video_recording: bool = False
    copy_paste_logging: bool = False
    allow_back: bool = False
    double_confirm: bool = False
    allow_pause: bool = False
    show_clock: bool = False
    ai_enabled: bool = False

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_stage_shape(cls, value: Any) -> Any:
        """Accept the previous type/content payload while clients migrate."""

        if not isinstance(value, dict):
            return value
        converted = dict(value)
        template_type = converted.pop("type", None)
        if "template_type" not in converted and "templateType" not in converted and template_type:
            converted["template_type"] = template_type
        content = converted.pop("content", None)
        if "components" not in converted and isinstance(content, dict):
            text = str(content.get("text", ""))
            component_type = (
                "long_text"
                if template_type == "questionnaire"
                else "workspace"
                if template_type == "task"
                else "text"
            )
            converted["components"] = [
                {
                    "id": "legacy-primary",
                    "type": component_type,
                    "text": text,
                    "required": template_type in {"questionnaire", "task"},
                }
            ] if text else []
        return converted

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Stage title cannot be blank")
        return value


class ExperimentInput(ApiModel):
    name: str = Field(min_length=1, max_length=255)
    fullscreen_mode: bool
    data_storage_description: str = Field(default="", max_length=10_000)
    storage_location: str = Field(default="", max_length=255)
    participant_safety_information: str = Field(default="", max_length=10_000)
    stages: list[StageInput] = Field(min_length=1, max_length=20)
    status: Literal["draft", "published", "closed"] | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Experiment name cannot be blank")
        return value


class StageRead(StageInput):
    id: UUID


class ExperimentRead(ApiModel):
    id: UUID
    name: str
    code: str
    status: Literal["draft", "published", "closed"]
    fullscreen_mode: bool
    data_storage_description: str
    storage_location: str
    participant_safety_information: str
    created_at: datetime
    stages: list[StageRead] | None = None


class ParticipantProvision(ApiModel):
    participant_code: str | None = Field(default=None, min_length=4, max_length=128)


class ParticipantProvisioned(ApiModel):
    participant_id: UUID
    participant_code: str


class ParticipantRead(ApiModel):
    id: UUID
    status: str
    created_at: datetime
