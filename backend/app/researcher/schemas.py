"""Pydantic schemas for researcher / experiment DTOs (camelCase JSON)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

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
    id: str
    type: str
    label: str
    required: bool = False
    options: Optional[list[str]] = None


class Stage(CamelModel):
    id: str
    name: str
    type: str
    duration: int = 0
    components: list[StageComponent] = []
    features: dict[str, bool] = {}
    countdown_minutes: int = 0


# Stages are a free-form, researcher-authored nested structure (components +
# per-stage feature flags + arbitrary UI metadata). The frontend is the editor
# of record, so we accept them as raw JSON and store them verbatim rather than
# coercing them through a strict schema — a strict `Stage` model would
# silently drop fields (placeholder, sequence, validation, ...) on every save,
# corrupting the experiment the researcher built. See P0 #3.
class ExperimentCreate(CamelModel):
    id: Optional[str] = None
    name: str
    code: str
    status: str = "Draft"
    full_screen: bool = False
    stages: list[Any] = []


class ExperimentUpdate(CamelModel):
    name: Optional[str] = None
    code: Optional[str] = None
    status: Optional[str] = None
    full_screen: Optional[bool] = None
    stages: Optional[list[Any]] = None


class Experiment(CamelORMModel):
    id: str
    name: str
    code: str
    status: str
    created: str
    full_screen: bool
    stages: list[Any] = []
