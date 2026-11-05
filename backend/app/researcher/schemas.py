"""Pydantic schemas for researcher / experiment DTOs (camelCase JSON)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from pydantic import ConfigDict, SecretStr, Field, field_validator

from app.core.schemas import CamelModel, CamelORMModel


class Researcher(CamelORMModel):
    id: str
    name: str
    email: str
    role: Literal["researcher", "administrator"] = "researcher"
    account_status: Literal["active", "pending", "disabled"] = "active"
    created_at: datetime


class ResearcherCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    password: Optional[str] = None

    @field_validator("name", "email", mode="before")
    @classmethod
    def trim_identity(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, value):
        if value is not None and (not value or len(value.encode("utf-8")) > 72):
            raise ValueError("Use a password between 1 and 72 UTF-8 bytes.")
        return value


class ResearcherRegistration(ResearcherCreate):
    password: str = Field(min_length=6)


class ProfileUpdate(CamelModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=255)

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class PasswordChange(CamelModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6)

    @field_validator("current_password", "new_password")
    @classmethod
    def password_length(cls, value):
        return ResearcherCreate.validate_password_length(value)


class LoginRequest(CamelModel):
    email: str
    password: str

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, value):
        return ResearcherCreate.validate_password_length(value)


class LoginResponse(CamelModel):
    token: str
    researcher: Researcher
    issued_at: str


class StageComponent(CamelModel):
    model_config = ConfigDict(extra="allow")
    id: str
    type: str
    label: str
    required: bool = False
    options: Optional[list[str]] = None
    other_option: Optional[str] = None


class Stage(CamelModel):
    model_config = ConfigDict(extra="allow")
    id: str
    name: str
    type: str
    duration: int = 0
    components: list[StageComponent] = []
    features: dict[str, bool] = {}
    countdown_minutes: int = 0
    required_features: dict[Literal["questionnaire", "signatureBox", "attachment"], bool] = {}
    recording_required: bool = False
    recording_mode: Literal["manual", "auto"] = "manual"
    signing_method: Literal["handwritten", "name"] = "handwritten"
    consent_clauses: list[str] = []
    allow_extension: bool = False
    timer_expiry: Literal["manual", "advance"] = "manual"
    extension_minutes: int = Field(default=30, ge=1, le=1440)
    sequential_questions: bool = False


class ExperimentCreate(CamelModel):
    id: Optional[str] = None
    name: str
    code: Optional[str] = None
    status: Literal["Draft", "Live", "Closed"] = "Draft"
    full_screen: bool = False
    storage_notice: str = Field(default="", max_length=8000)
    stages: list[Stage] = []


class ExperimentUpdate(CamelModel):
    publish: bool = False
    publish_request_id: Optional[str] = None
    name: Optional[str] = None
    code: Optional[str] = None
    status: Optional[Literal["Draft", "Live", "Closed"]] = None
    full_screen: Optional[bool] = None
    storage_notice: str = Field(default="", max_length=8000)
    stages: Optional[list[Stage]] = None


class Experiment(CamelORMModel):
    id: str
    name: str
    code: str
    status: str
    created: str
    full_screen: bool
    storage_notice: str = ""
    stages: list[Stage] = []


class StorageSettings(CamelModel):
    location: str | None = None


class ExperimentAIKey(CamelModel):
    use_common: bool | None = None
    api_key: SecretStr | None = None
    provider: Literal["openai_compatible", "google", "workbuddy"] | None = None
    api_base: str | None = Field(default=None, max_length=2048)
    model: str | None = Field(default=None, min_length=1, max_length=255)
    stream: bool | None = None
    timeout_seconds: float | None = Field(default=None, gt=0, le=600)
    temperature: float | None = Field(default=None, ge=0, le=2)
    system_prompt: str | None = Field(default=None, max_length=50000)
    max_prompt_chars: int | None = Field(default=None, ge=1, le=20000)
    history_messages: int | None = Field(default=None, ge=0, le=100)
    history_message_chars: int | None = Field(default=None, ge=1, le=20000)

    @field_validator("api_base")
    @classmethod
    def completion_url(cls, value):
        from urllib.parse import urlsplit
        if value is not None:
            url = urlsplit(value)
            if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password or url.fragment:
                raise ValueError("Use a full HTTP(S) completion URL without embedded credentials or a fragment")
        return value

    @field_validator("model")
    @classmethod
    def model_identifier(cls, value):
        if value is not None and not value.strip():
            raise ValueError("Enter a model identifier")
        return value.strip() if value is not None else None
