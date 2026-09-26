"""Pydantic request and response contracts for the public HTTP API."""

from typing import Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """Successful envelope shared across API endpoints."""

    data: T
    message: str = "Success"


class ResearcherCredentials(BaseModel):
    """Normalised and validated researcher login input."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class ParticipantCredentials(BaseModel):
    """Participant login codes; route logs must never include these values."""

    experiment_code: str = Field(min_length=4, max_length=64)
    participant_code: str = Field(min_length=4, max_length=128)


class AdministratorCredentials(BaseModel):
    """Administrator password input, accepted only over HTTPS."""

    password: str = Field(min_length=8, max_length=256)


class CurrentUser(BaseModel):
    """Safe session identity returned to the browser."""

    id: UUID
    role: Literal["researcher", "participant", "administrator"]
    email: EmailStr | None = None


class ExperimentSummary(BaseModel):
    """Researcher dashboard representation without participant data."""

    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    code: str
    status: Literal["draft", "published", "closed"]
    fullscreen_mode: bool


class StageInput(BaseModel):
    """Validated stage configuration used when replacing an ordered stage list."""

    type: Literal["consent", "questionnaire", "task"]
    title: str = Field(min_length=1, max_length=255)
    content: dict[str, Any]
    position: int = Field(ge=0)
    time_limit: int | None = Field(default=None, ge=1)
