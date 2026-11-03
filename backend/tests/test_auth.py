"""Auth and researcher management tests."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings


@pytest.mark.parametrize("driver", ["postgres", "postgresql", "postgresql+psycopg"])
def test_postgresql_urls_use_the_installed_psycopg_driver(driver):
    configured = Settings(
        _env_file=None, database_url=f"{driver}://user:password@localhost/test"
    )
    assert (
        configured.database_url == "postgresql+psycopg://user:password@localhost/test"
    )


@pytest.mark.parametrize(
    "url", ["sqlite://", "sqlite:///dev.db", "mysql://localhost/test", "invalid-url"]
)
def test_unsupported_database_urls_are_rejected(url):
    with pytest.raises(ValidationError, match="PostgreSQL"):
        Settings(_env_file=None, database_url=url)


def test_database_uses_postgresql_and_real_migrations(client):
    from app.core import database
    from sqlalchemy import inspect

    with database.engine.connect() as connection:
        assert connection.dialect.name == "postgresql"
        assert (
            connection.exec_driver_sql("SELECT current_schema()")
            .scalar_one()
            .startswith("test_")
        )
        assert (
            connection.exec_driver_sql(
                "SELECT version_num FROM alembic_version"
            ).scalar_one()
            == "7c7c7c7c7c7c"
        )
        inspector = inspect(connection)
        columns = {
            column["name"]: column for column in inspector.get_columns("experiments")
        }
        assert columns["owner_id"]["nullable"] is True
        foreign_keys = inspector.get_foreign_keys("experiments")
        assert any(
            key["name"] == "fk_experiment_owner"
            and key["constrained_columns"] == ["owner_id"]
            and key["referred_table"] == "researchers"
            and key["referred_columns"] == ["id"]
            for key in foreign_keys
        )
        assert any(
            index["name"] == "ix_experiments_owner_id"
            and index["column_names"] == ["owner_id"]
            for index in inspector.get_indexes("experiments")
        )


def test_register_returns_researcher(client):
    r = client.post(
        "/api/auth/register",
        json={"name": "Alice", "email": "alice@example.com", "password": "pw12345"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "alice@example.com"
    assert data["role"] == "researcher"
    assert "id" in data
    # camelCase contract
    assert "createdAt" in data


def test_register_duplicate_email(client):
    payload = {"name": "C", "email": "c@example.com", "password": "pw"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    assert client.post("/api/auth/register", json=payload).status_code == 409


def test_login_success_returns_session_shape(client):
    client.post(
        "/api/auth/register",
        json={"name": "Bob", "email": "bob@example.com", "password": "pw12345"},
    )
    r = client.post(
        "/api/auth/login", json={"email": "bob@example.com", "password": "pw12345"}
    )
    assert r.status_code == 200
    body = r.json()
    assert "token" in body
    assert "researcher" in body
    assert "issuedAt" in body  # matches frontend Session type
    assert body["researcher"]["email"] == "bob@example.com"


def test_login_wrong_password(client):
    client.post(
        "/api/auth/register",
        json={"name": "Eve", "email": "eve@example.com", "password": "pw"},
    )
    r = client.post(
        "/api/auth/login", json={"email": "eve@example.com", "password": "nope"}
    )
    assert r.status_code == 401


def test_protected_endpoint_requires_auth(client):
    assert client.get("/api/researchers").status_code == 401


def test_researcher_cannot_promote_or_list_accounts(client, auth_headers):
    assert client.get("/api/researchers", headers=auth_headers).status_code == 403
    assert (
        client.patch(
            "/api/researchers/anything/promote", headers=auth_headers
        ).status_code
        == 403
    )


def test_logout(client):
    assert client.post("/api/auth/logout").status_code == 200


def test_backend_does_not_serve_frontend_pages(client):
    for path in ("/", "/researcher/dashboard", "/participant", "/assets/missing.js"):
        assert client.get(path).status_code == 404


def test_unknown_api_returns_json_not_found(client):
    response = client.get("/api/not-a-real-endpoint")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")


def test_upgrade_from_original_head_preserves_existing_experiments(
    client, auth_headers
):
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    from app.core import database

    response = client.post(
        "/api/experiments",
        headers=auth_headers,
        json={"name": "Historical study", "stages": []},
    )
    study_id = response.json()["id"]
    # Simulate the original 0003 schema in this test's isolated PostgreSQL schema.
    with database.engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE ai_chat_turns, ai_conversations")
        connection.exec_driver_sql("ALTER TABLE researchers DROP COLUMN storage_location")
        connection.exec_driver_sql("ALTER TABLE experiments DROP COLUMN owner_id")
        connection.exec_driver_sql(
            "ALTER TABLE participant_events ALTER COLUMN epoch_ms TYPE INTEGER"
        )
        # 0007 added the per-tab lease columns; they are not part of the
        # simulated 0003 schema being upgraded from.
        connection.exec_driver_sql(
            "ALTER TABLE participant_sessions DROP COLUMN active_client_id, "
            "DROP COLUMN lease_expires_at"
        )
        connection.exec_driver_sql(
            "UPDATE alembic_version SET version_num = '3c3c3c3c3c3c'"
        )
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        row = connection.exec_driver_sql(
            "SELECT id, name, owner_id FROM experiments"
        ).one()
        assert row == (study_id, "Historical study", None)
        assert (
            connection.exec_driver_sql(
                "SELECT version_num FROM alembic_version"
            ).scalar_one()
            == "7c7c7c7c7c7c"
        )


def test_upgrade_adopts_unversioned_create_all_database(client, auth_headers):
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    from app.core import database

    study = client.post(
        "/api/experiments",
        headers=auth_headers,
        json={"name": "Pre-Alembic study", "stages": []},
    ).json()
    with database.engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE ai_chat_turns, ai_conversations")
        connection.exec_driver_sql("ALTER TABLE researchers DROP COLUMN storage_location")
        connection.exec_driver_sql("ALTER TABLE experiments DROP COLUMN owner_id")
        connection.exec_driver_sql(
            "ALTER TABLE participant_events ALTER COLUMN epoch_ms TYPE INTEGER"
        )
        # 0007 added the per-tab lease columns; they are not part of the
        # simulated pre-Alembic schema being adopted.
        connection.exec_driver_sql(
            "ALTER TABLE participant_sessions DROP COLUMN active_client_id, "
            "DROP COLUMN lease_expires_at"
        )
        connection.exec_driver_sql("DROP TABLE alembic_version")
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        assert connection.exec_driver_sql("SELECT id, name FROM experiments").one() == (
            study["id"],
            "Pre-Alembic study",
        )
        assert (
            connection.exec_driver_sql(
                "SELECT version_num FROM alembic_version"
            ).scalar_one()
            == "7c7c7c7c7c7c"
        )
        command.upgrade(config, "head")
        assert (
            connection.exec_driver_sql("SELECT count(*) FROM experiments").scalar_one()
            == 1
        )


def test_unversioned_incompatible_schema_is_not_stamped(client):
    from app.core import database
    from app.core.database import legacy_schema_baseline
    import pytest

    with database.engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE alembic_version")
        connection.exec_driver_sql("DROP TABLE ai_chat_turns, ai_conversations")
        connection.exec_driver_sql("ALTER TABLE researchers DROP COLUMN storage_location")
        connection.exec_driver_sql(
            "ALTER TABLE researchers RENAME COLUMN email TO legacy_email"
        )
        with pytest.raises(RuntimeError, match="missing column researchers.email"):
            legacy_schema_baseline(connection)
        assert (
            not __import__("sqlalchemy")
            .inspect(connection)
            .has_table("alembic_version")
        )


@pytest.mark.parametrize("email,allowed", [
    ("Alice@Example.COM", True), (" alice@example.com ", True),
    ("bob@approved.edu", True), ("bob@sub.approved.edu", False),
    ("bob@evilapproved.edu", False), ("alice@example.com.evil", False),
    ("bob@example.com", False),
])
def test_access_allowlist_exact_boundaries(monkeypatch, email, allowed):
    from app.core.config import settings, require_allowed_email
    from fastapi import HTTPException
    monkeypatch.setattr(settings, "access_allowlist_enabled", True)
    monkeypatch.setattr(settings, "allowed_emails", "alice@example.com")
    monkeypatch.setattr(settings, "allowed_domains", "approved.edu")
    if allowed:
        assert require_allowed_email(email) == email.strip().lower()
    else:
        with pytest.raises(HTTPException) as error: require_allowed_email(email)
        assert error.value.status_code == 403


def test_enabled_empty_allowlist_denies_access(monkeypatch):
    from app.core.config import settings, require_allowed_email
    from fastapi import HTTPException
    monkeypatch.setattr(settings, "access_allowlist_enabled", True)
    monkeypatch.setattr(settings, "allowed_emails", "")
    monkeypatch.setattr(settings, "allowed_domains", "")
    with pytest.raises(HTTPException): require_allowed_email("user@example.com")
    monkeypatch.setattr(settings, "access_allowlist_enabled", False)
    assert require_allowed_email("user@example.com") == "user@example.com"


@pytest.mark.parametrize("email,allowed", [
    ("k.alqattan@unsw.edu.au", True), ("K.AlQattan@UNSW.edu.au", True),
    ("k.alqattan@ad.unsw.edu.au", False), ("researcher@unsw.edu.au", False),
])
def test_client_allowlist_admits_only_the_configured_client_address(monkeypatch, email, allowed):
    """The snippet documented in .env.example admits the client and nobody else.

    Listing one address must not silently open the UNSW domain, so the shared
    student/staff subdomain stays rejected until it is named explicitly.
    """
    from app.core.config import settings, require_allowed_email
    from fastapi import HTTPException
    monkeypatch.setattr(settings, "access_allowlist_enabled", True)
    monkeypatch.setattr(settings, "allowed_emails", "k.alqattan@unsw.edu.au")
    monkeypatch.setattr(settings, "allowed_domains", "")
    if allowed:
        assert require_allowed_email(email) == "k.alqattan@unsw.edu.au"
    else:
        with pytest.raises(HTTPException) as error: require_allowed_email(email)
        assert error.value.status_code == 403

