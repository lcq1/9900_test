"""PostgreSQL fixtures: a migrated temporary schema per API test."""

from collections.abc import Iterator
import os
from pathlib import Path
import sys
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alembic import command
from alembic.config import Config
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateSchema, DropSchema

from app.core.config import Settings, settings
from app.core.database import get_db
from app.main import app


@pytest.fixture(autouse=True)
def isolated_ai_settings(monkeypatch):
    """Local WorkBuddy credentials must never enable real model calls in tests."""
    monkeypatch.setattr(settings, "ai_provider", "openai_compatible")
    monkeypatch.setattr(settings, "ai_api_key", None)
    monkeypatch.setattr(
        settings, "ai_api_base", "https://ai.example/v1/chat/completions"
    )
    monkeypatch.setattr(settings, "ai_model", "test-model")
    monkeypatch.setattr(settings, "ai_stream", True)
    monkeypatch.setattr(settings, "ai_system_prompt", None)
    monkeypatch.setattr(settings, "ai_temperature", None)
    monkeypatch.setattr(settings, "ai_max_prompt_chars", 4000)
    monkeypatch.setattr(settings, "ai_history_messages", 8)
    monkeypatch.setattr(settings, "ai_history_message_chars", 2000)


@pytest.fixture(scope="session")
def postgres_test_database() -> Iterator[Engine]:
    test_url = Settings(
        _env_file=None,
        database_url=os.environ.get(
            "TEST_DATABASE_URL",
            "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/experiment_platform_test",
        ),
    ).database_url
    engine = create_engine(
        test_url, connect_args={"connect_timeout": 5}, pool_pre_ping=True
    )
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
    except SQLAlchemyError:
        engine.dispose()
        pytest.fail(
            "PostgreSQL test database is unavailable. Create experiment_platform_test "
            "or set TEST_DATABASE_URL to a prepared PostgreSQL test database.",
            pytrace=False,
        )
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture()
def client(postgres_test_database: Engine) -> Iterator[TestClient]:
    import app.core.database as database

    schema = "test_" + uuid4().hex
    with postgres_test_database.begin() as connection:
        connection.execute(CreateSchema(schema))
    engine = create_engine(
        postgres_test_database.url,
        connect_args={"options": f"-csearch_path={schema}", "connect_timeout": 5},
        pool_pre_ping=True,
    )
    sessions = sessionmaker(bind=engine, autoflush=False)
    old_engine, old_sessions = database.engine, database.SessionLocal

    def test_db():
        with sessions() as db:
            yield db

    try:
        migration = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        with engine.begin() as connection:
            migration.attributes["connection"] = connection
            command.upgrade(migration, "head")
        database.engine, database.SessionLocal = engine, sessions
        app.dependency_overrides[get_db] = test_db
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        database.engine, database.SessionLocal = old_engine, old_sessions
        engine.dispose()
        # Only the randomly generated schema created by this fixture is removed.
        with postgres_test_database.begin() as connection:
            connection.execute(DropSchema(schema, cascade=True))


def register_and_login(
    client,
    name="Test Researcher",
    email="researcher@example.com",
    password="password123",
):
    response = client.post(
        "/api/auth/register", json={"name": name, "email": email, "password": password}
    )
    assert response.status_code == 201, response.text
    response = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    return response.json()["token"]


@pytest.fixture()
def auth_headers(client):
    return {"Authorization": "Bearer " + register_and_login(client)}


@pytest.fixture()
def admin_headers(client):
    from app.core import database
    from app.researcher.models import Researcher

    token = register_and_login(client, email="admin@example.com")
    with database.SessionLocal() as db:
        db.query(Researcher).filter(
            Researcher.email == "admin@example.com"
        ).one().role = "administrator"
        db.commit()
    return {"Authorization": "Bearer " + token}
