"""Database engine, session factory, declarative ``Base`` and DI helper."""
from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings

# SQLite requires check_same_thread=False when used across FastAPI threads.
_connect_args: dict[str, Any] = {}
if settings.database_url.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_engine(settings.database_url, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a database session and closes it after."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
