"""Shared ORM timestamp mixin and ID generator."""

from __future__ import annotations

from app.core import clock

import uuid
from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column


def gen_uuid() -> str:
    """Generate a new UUID4 string for use as a primary key."""
    return str(uuid.uuid4())


class TimestampMixin:
    """Adds a ``created_at`` UTC timestamp column to a model."""

    created_at: Mapped[datetime] = mapped_column(default=clock.now)
