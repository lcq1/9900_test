"""Reusable Pydantic base models that serialise to camelCase JSON.

The frontend contract requires camelCase field names in JSON payloads. We keep
Python attribute names in snake_case (idiomatic) and rely on Pydantic's
``alias_generator`` to emit camelCase on serialisation while still accepting
camelCase (or snake_case) on input via ``populate_by_name``.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model that accepts and emits camelCase field names."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class CamelORMModel(CamelModel):
    """CamelCase model that can be populated directly from ORM objects."""

    model_config = ConfigDict(
        from_attributes=True, populate_by_name=True, alias_generator=to_camel
    )
