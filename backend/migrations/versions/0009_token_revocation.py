"""Persist individual researcher-token revocations until expiry."""
from alembic import op
import sqlalchemy as sa

revision = "9e9e9e9e9e9e"
down_revision = "8d8d8d8d8d8d"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "revoked_access_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("researcher_id", sa.String(36), sa.ForeignKey("researchers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=False),
    )
    op.create_index("ix_revoked_access_tokens_expires_at", "revoked_access_tokens", ["expires_at"])


def downgrade():
    op.drop_table("revoked_access_tokens")
