"""Database engine, session factory, declarative ``Base`` and DI helper."""

from __future__ import annotations

from collections.abc import Iterator
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def legacy_schema_baseline(connection: Connection) -> str | None:
    """Recognize the old create_all schema before adopting migration history.

    Never stamp merely because one table exists: a partial or incompatible
    installation must be repaired explicitly instead of skipping migrations.
    Data, defaults, and nullability are left unchanged.
    """
    inspector = inspect(connection)
    legacy_tables = {
        "researchers",
        "experiments",
        "participant_sessions",
        "participant_events",
        "answers",
        "consents",
        "recordings",
        "platform_settings",
    }
    present = set(inspector.get_table_names())
    if present.intersection({"ai_conversations", "ai_chat_turns"}):
        raise RuntimeError(
            "Unversioned database contains newer AI tables; restore its migration history explicitly."
        )
    if not present.intersection(legacy_tables):
        return None
    missing = legacy_tables - present
    problems = [f"missing table {name}" for name in sorted(missing)]
    for name in sorted(legacy_tables & present):
        expected = Base.metadata.tables[name]
        columns = {column["name"]: column for column in inspector.get_columns(name)}
        for column in expected.columns:
            if (name, column.name) in {
                ("experiments", "owner_id"),
                ("experiments", "storage_notice"),
                ("researchers", "account_status"),
                ("researchers", "auth_version"),
                ("platform_settings", "require_researcher_approval"),
                ("platform_settings", "default_storage_location"),
                ("researchers", "storage_location"),
                ("participant_sessions", "active_client_id"),
                ("participant_sessions", "lease_expires_at"),
            }:
                continue  # Added by later migrations, not required in the original schema.
            actual = columns.get(column.name)
            if actual is None:
                problems.append(f"missing column {name}.{column.name}")
            elif actual["type"]._type_affinity is not column.type._type_affinity:
                problems.append(f"incompatible type for {name}.{column.name}")
            elif (
                getattr(actual["type"], "length", None) is not None
                and getattr(column.type, "length", None) is not None
                and actual["type"].length < column.type.length
            ):
                problems.append(f"insufficient length for {name}.{column.name}")
        if set(inspector.get_pk_constraint(name)["constrained_columns"]) != {"id"}:
            problems.append(f"incompatible primary key for {name}")
        unique = {
            tuple(item["column_names"])
            for item in inspector.get_unique_constraints(name)
        }
        unique.update(
            tuple(item["column_names"])
            for item in inspector.get_indexes(name)
            if item.get("unique")
        )
        key = {"researchers": "email", "experiments": "code"}.get(name)
        if key and (key,) not in unique:
            problems.append(f"missing unique constraint for {name}.{key}")
    if problems:
        raise RuntimeError(
            "Unversioned database does not match the legacy schema; migration was not adopted: "
            + "; ".join(problems)
        )
    return "3c3c3c3c3c3c"


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a database session and closes it after."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
