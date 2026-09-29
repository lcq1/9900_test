"""Align generic Stages, Participant sessions and event timelines with Plan.md.

Revision ID: 0004_plan_alignment
Revises: 0003_participant_schema
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0004_plan_alignment"
down_revision: str | None = "0003_participant_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("experiments", sa.Column("data_storage_description", sa.Text(), nullable=False, server_default=""))
    op.add_column("experiments", sa.Column("storage_location", sa.String(length=255), nullable=False, server_default=""))
    op.add_column("experiments", sa.Column("participant_safety_information", sa.Text(), nullable=False, server_default=""))

    op.alter_column("stages", "type", new_column_name="template_type", existing_type=sa.String(length=32), nullable=True)
    op.alter_column(
        "stages",
        "content",
        new_column_name="components",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
    )
    op.execute(
        """
        UPDATE stages
        SET components = jsonb_build_array(
            jsonb_build_object(
                'id', 'migrated-primary',
                'type', CASE
                    WHEN template_type = 'questionnaire' THEN 'long_text'
                    WHEN template_type = 'task' THEN 'workspace'
                    ELSE 'text'
                END,
                'text', COALESCE(components->>'text', ''),
                'required', CASE WHEN template_type IN ('questionnaire', 'task') THEN true ELSE false END
            )
        )
        WHERE jsonb_typeof(components) = 'object'
        """
    )
    op.add_column("stages", sa.Column("timer_end_action", sa.String(length=32), nullable=False, server_default="next_stage"))
    op.add_column("stages", sa.Column("extra_time_seconds", sa.Integer(), nullable=True))
    for name in (
        "screen_recording",
        "audio_recording",
        "video_recording",
        "copy_paste_logging",
        "allow_back",
        "double_confirm",
        "allow_pause",
        "show_clock",
        "ai_enabled",
    ):
        op.add_column("stages", sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.false()))

    op.add_column(
        "participant_sessions",
        sa.Column("stage_progress", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.add_column("participant_sessions", sa.Column("resume_status", sa.String(length=32), nullable=False, server_default="not_started"))
    op.add_column("participant_sessions", sa.Column("last_saved_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("stage_id", sa.Uuid(), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("client_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("client_sequence", sa.BigInteger(), nullable=False),
        sa.Column("server_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["participant_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stage_id"], ["stages.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "client_sequence", name="uq_event_session_sequence"),
    )
    op.create_index("ix_events_session_id", "events", ["session_id"])
    op.create_index("ix_events_stage_id", "events", ["stage_id"])
    op.create_index("ix_events_event_type", "events", ["event_type"])
    op.create_index("ix_events_server_timestamp", "events", ["server_timestamp"])

    op.create_table(
        "recordings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("stage_id", sa.Uuid(), nullable=False),
        sa.Column("media_type", sa.String(length=16), nullable=False),
        sa.Column("storage_key", sa.String(length=1024), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("time_limit_seconds", sa.Integer(), nullable=True),
        sa.Column("access_level", sa.String(length=32), nullable=False, server_default="restricted"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["participant_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stage_id"], ["stages.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recordings_session_id", "recordings", ["session_id"])
    op.create_index("ix_recordings_stage_id", "recordings", ["stage_id"])

    op.create_table(
        "ai_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("stage_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("server_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["participant_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stage_id"], ["stages.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "stage_id", "sequence", name="uq_ai_message_sequence"),
    )
    op.create_index("ix_ai_messages_session_id", "ai_messages", ["session_id"])
    op.create_index("ix_ai_messages_stage_id", "ai_messages", ["stage_id"])
    op.create_index("ix_ai_messages_server_timestamp", "ai_messages", ["server_timestamp"])

    op.create_table(
        "ai_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("stage_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("request_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("result_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["participant_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stage_id"], ["stages.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_jobs_session_id", "ai_jobs", ["session_id"])
    op.create_index("ix_ai_jobs_stage_id", "ai_jobs", ["stage_id"])

    op.create_table(
        "export_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), nullable=False),
        sa.Column("participant_id", sa.Uuid(), nullable=True),
        sa.Column("export_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("storage_key", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["experiment_id"], ["experiments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_export_jobs_experiment_id", "export_jobs", ["experiment_id"])


def downgrade() -> None:
    op.drop_index("ix_export_jobs_experiment_id", table_name="export_jobs")
    op.drop_table("export_jobs")
    op.drop_index("ix_ai_jobs_stage_id", table_name="ai_jobs")
    op.drop_index("ix_ai_jobs_session_id", table_name="ai_jobs")
    op.drop_table("ai_jobs")
    op.drop_index("ix_ai_messages_server_timestamp", table_name="ai_messages")
    op.drop_index("ix_ai_messages_stage_id", table_name="ai_messages")
    op.drop_index("ix_ai_messages_session_id", table_name="ai_messages")
    op.drop_table("ai_messages")
    op.drop_index("ix_recordings_stage_id", table_name="recordings")
    op.drop_index("ix_recordings_session_id", table_name="recordings")
    op.drop_table("recordings")
    op.drop_index("ix_events_server_timestamp", table_name="events")
    op.drop_index("ix_events_event_type", table_name="events")
    op.drop_index("ix_events_stage_id", table_name="events")
    op.drop_index("ix_events_session_id", table_name="events")
    op.drop_table("events")
    op.drop_column("participant_sessions", "last_saved_at")
    op.drop_column("participant_sessions", "resume_status")
    op.drop_column("participant_sessions", "stage_progress")
    for name in reversed((
        "screen_recording",
        "audio_recording",
        "video_recording",
        "copy_paste_logging",
        "allow_back",
        "double_confirm",
        "allow_pause",
        "show_clock",
        "ai_enabled",
    )):
        op.drop_column("stages", name)
    op.drop_column("stages", "extra_time_seconds")
    op.drop_column("stages", "timer_end_action")
    op.execute(
        """
        UPDATE stages
        SET components = jsonb_build_object(
            'text', COALESCE(components->0->>'text', '')
        )
        WHERE jsonb_typeof(components) = 'array'
        """
    )
    op.alter_column("stages", "components", new_column_name="content", existing_type=postgresql.JSONB(astext_type=sa.Text()))
    op.alter_column("stages", "template_type", new_column_name="type", existing_type=sa.String(length=32), nullable=False)
    op.drop_column("experiments", "participant_safety_information")
    op.drop_column("experiments", "storage_location")
    op.drop_column("experiments", "data_storage_description")
