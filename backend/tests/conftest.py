"""Pytest fixtures: isolated SQLite DB, TestClient and auth helpers."""
from __future__ import annotations

import os
import sys
import tempfile
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure the backend directory is importable as the project root.
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.core.database import Base, SessionLocal  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client() -> Iterator[TestClient]:
    """Provide a TestClient backed by a fresh, isolated SQLite database.

    The module-level engine/session are swapped for an isolated in-tmp SQLite
    database so each test runs against a clean schema without touching dev.db.
    """
    tmp = tempfile.mkdtemp(prefix="beyond_test_")
    test_url = f"sqlite:///{os.path.join(tmp, 'test.db')}"
    test_engine = create_engine(
        test_url, connect_args={"check_same_thread": False}, future=True
    )
    TestSessionLocal = sessionmaker(
        bind=test_engine, autoflush=False, autocommit=False, future=True
    )
    Base.metadata.create_all(bind=test_engine)

    import app.core.database as db_mod

    original_engine = db_mod.engine
    original_session = db_mod.SessionLocal
    db_mod.engine = test_engine
    db_mod.SessionLocal = TestSessionLocal

    with TestClient(app) as test_client:
        yield test_client

    db_mod.engine = original_engine
    db_mod.SessionLocal = original_session
    Base.metadata.drop_all(bind=test_engine)