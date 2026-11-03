"""Pydantic schemas for researcher / experiment DTOs (camelCase JSON)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from pydantic import ConfigDict

from app.core.schemas import CamelModel, CamelORMModel


class Researcher(CamelORMModel):
    id: str
    name: str
    email: str
    role: Literal["researcher", "administrator"] = "researcher"
    created_at: datetime


class ResearcherCreate(CamelModel):
    name: str
    email: str
    password: Optional[str] = None


class LoginRequest(CamelModel):
    email: str
    password: str


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
    sequential_questions: bool = False


class ExperimentCreate(CamelModel):
    id: Optional[str] = None
    name: str
    code: Optional[str] = None
    status: str = "Draft"
    full_screen: bool = False
    stages: list[Stage] = []


class ExperimentUpdate(CamelModel):
    publish: bool = False
    publish_request_id: Optional[str] = None
    name: Optional[str] = None
    code: Optional[str] = None
    status: Optional[str] = None
    full_screen: Optional[bool] = None
    stages: Optional[list[Stage]] = None


class Experiment(CamelORMModel):
    id: str
    name: str
    code: str
    status: str
    created: str
    full_screen: bool
    stages: list[Stage] = []


class StorageSettings(CamelModel):
    location: str | None = None
