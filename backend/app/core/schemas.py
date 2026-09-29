"""Shared API response and session identity schemas."""

import re
from typing import Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


def to_camel(value: str) -> str:
    return re.sub(r"_([a-z])", lambda match: match.group(1).upper(), value)


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


T = TypeVar("T")


class ApiResponse(ApiModel, Generic[T]):
    data: T
    message: str = "Success"


class CurrentUser(ApiModel):
    id: UUID
    role: Literal["researcher", "participant", "administrator"]
    email: EmailStr | None = None
