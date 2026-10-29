"""Apply the PostgreSQL schema through Alembic, including isolated test schemas."""
from alembic import context
from alembic.script import ScriptDirectory
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.core.database import Base, legacy_schema_baseline
from app.researcher import models as researcher_models  # noqa: F401
from app.participant import models as participant_models  # noqa: F401
from app.administrator import models as administrator_models  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
target_metadata = Base.metadata


def migrate(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        # Serialize startup migrations for this schema, including legacy adoption.
        connection.exec_driver_sql("SELECT pg_advisory_xact_lock(hashtext('beyond-migrations:' || current_schema()))")
        migration = context.get_context()
        if not migration.get_current_heads():
            baseline = legacy_schema_baseline(connection)
            if baseline is not None:
                migration.stamp(ScriptDirectory.from_config(config), baseline)
        context.run_migrations()


def offline():
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def online():
    connection = config.attributes.get("connection")
    if connection is not None:
        migrate(connection)
        return
    engine = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    try:
        with engine.connect() as connection:
            migrate(connection)
    finally:
        engine.dispose()


if context.is_offline_mode():
    offline()
else:
    online()
