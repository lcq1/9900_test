"""Administrator platform-settings schema (app.administrator.models).

Creates the single-row platform_settings table used for global settings
(self-registration, consent signature, retention, session length).
"""
from alembic import op
import sqlalchemy as sa

revision = "3c3c3c3c3c3c"
down_revision = "2b2b2b2b2b2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column("id", sa.Integer(), primary_key=True, server_default="1"),
        sa.Column(
            "allow_self_registration",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "require_consent_signature",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "data_retention_days",
            sa.Integer(),
            nullable=False,
            server_default="365",
        ),
        sa.Column(
            "max_session_minutes",
            sa.Integer(),
            nullable=False,
            server_default="60",
        ),
    )


def downgrade() -> None:
    op.drop_table("platform_settings")
