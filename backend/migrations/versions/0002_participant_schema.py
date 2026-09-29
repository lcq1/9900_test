"""Create Participant, execution session and response tables.

Revision ID: 0003_participant_schema
Revises: 0002_researcher_schema
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0003_participant_schema"
down_revision: str | None = "0002_researcher_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "participants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), nullable=False),
        sa.Column("participant_code_digest", sa.String(length=64), nullable=False),
        sa.Column("participant_code_hash", sa.String(length=512), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["experiment_id"], ["experiments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("experiment_id", "participant_code_digest", name="uq_participant_experiment_code"),
    )
    op.create_index("ix_participants_experiment_id", "participants", ["experiment_id"])

    op.create_table(
        "participant_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("participant_id", sa.Uuid(), nullable=False),
        sa.Column("current_stage_id", sa.Uuid(), nullable=True),
        sa.Column("consented_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stage_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["current_stage_id"], ["stages.id"]),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_participant_sessions_participant_id", "participant_sessions", ["participant_id"])

    op.create_table(
        "responses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("stage_id", sa.Uuid(), nullable=False),
        sa.Column("answer_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["participant_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stage_id"], ["stages.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "stage_id", name="uq_response_session_stage"),
    )
    op.create_index("ix_responses_session_id", "responses", ["session_id"])
    op.create_index("ix_responses_stage_id", "responses", ["stage_id"])


def downgrade() -> None:
    op.drop_index("ix_responses_stage_id", table_name="responses")
    op.drop_index("ix_responses_session_id", table_name="responses")
    op.drop_table("responses")
    op.drop_index("ix_participant_sessions_participant_id", table_name="participant_sessions")
    op.drop_table("participant_sessions")
    op.drop_index("ix_participants_experiment_id", table_name="participants")
    op.drop_table("participants")
