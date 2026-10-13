"""Participant session, event, answer, consent and recording schema.

Models: app.participant.models.
"""
from alembic import op
import sqlalchemy as sa

revision = "2b2b2b2b2b2b"
down_revision = "1a1a1a1a1a1a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "participant_sessions",
        sa.Column(
            "id",
            sa.String(36),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("experiment_code", sa.String(64), nullable=True),
        sa.Column("participant_code", sa.String(128), nullable=True),
        sa.Column("started_at", sa.String(64), nullable=True),
        sa.Column("finished_at", sa.String(64), nullable=True),
    )
    op.create_index(
        "ix_participant_sessions_experiment_code",
        "participant_sessions",
        ["experiment_code"],
    )

    op.create_table(
        "participant_events",
        sa.Column(
            "id",
            sa.String(36),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("session_id", sa.String(36), nullable=True),
        sa.Column("seq", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("type", sa.String(64), nullable=True),
        sa.Column("timestamp", sa.String(64), nullable=True, server_default=""),
        sa.Column("epoch_ms", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("perf_ms", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("stage_id", sa.String(64), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
    )
    op.create_index(
        "ix_participant_events_session_id",
        "participant_events",
        ["session_id"],
    )

    op.create_table(
        "answers",
        sa.Column(
            "id",
            sa.String(36),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("session_id", sa.String(36), nullable=True),
        sa.Column("component_id", sa.String(128), nullable=True),
        sa.Column("value", sa.JSON(), nullable=True),
    )
    op.create_index("ix_answers_session_id", "answers", ["session_id"])

    op.create_table(
        "consents",
        sa.Column(
            "id",
            sa.String(36),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("session_id", sa.String(36), nullable=True),
        sa.Column("signed_at", sa.String(64), nullable=True),
        sa.Column("name", sa.String(256), nullable=True, server_default=""),
        sa.Column("payload", sa.JSON(), nullable=True, server_default=sa.text("'{}'")),
    )
    op.create_index("ix_consents_session_id", "consents", ["session_id"])

    op.create_table(
        "recordings",
        sa.Column(
            "id",
            sa.String(36),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("session_id", sa.String(36), nullable=True),
        sa.Column("filename", sa.String(256), nullable=True, server_default=""),
        sa.Column("path", sa.String(512), nullable=True, server_default=""),
        sa.Column("created_at", sa.String(64), nullable=True),
    )
    op.create_index("ix_recordings_session_id", "recordings", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_recordings_session_id", table_name="recordings")
    op.drop_table("recordings")
    op.drop_index("ix_consents_session_id", table_name="consents")
    op.drop_table("consents")
    op.drop_index("ix_answers_session_id", table_name="answers")
    op.drop_table("answers")
    op.drop_index("ix_participant_events_session_id", table_name="participant_events")
    op.drop_table("participant_events")
    op.drop_index(
        "ix_participant_sessions_experiment_code",
        table_name="participant_sessions",
    )
    op.drop_table("participant_sessions")
