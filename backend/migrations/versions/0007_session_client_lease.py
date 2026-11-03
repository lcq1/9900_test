"""Add a per-tab lease to unfinished participant sessions.

Two browser tabs opening the same experiment/participant pair used to fold
onto a single unfinished session and number events from separate queues, so
autosaves silently overwrote each other's answers. The lease lets the server
reject the second live tab while still allowing an explicit takeover after the
original tab goes away.

Revision ID: 7c7c7c7c7c7c
Revises: 6a6a6a6a6a6a
"""
from alembic import op
import sqlalchemy as sa

revision = "7c7c7c7c7c7c"
down_revision = "6a6a6a6a6a6a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "participant_sessions",
        sa.Column("active_client_id", sa.String(64), nullable=True),
    )
    op.add_column(
        "participant_sessions",
        sa.Column("lease_expires_at", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("participant_sessions", "lease_expires_at")
    op.drop_column("participant_sessions", "active_client_id")
