"""Allow administrators to delegate participant record deletion."""
from alembic import op
import sqlalchemy as sa

revision = "a0a0a0a0a0a0"
down_revision = "9e9e9e9e9e9e"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("platform_settings", sa.Column("allow_researcher_session_deletion", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column("platform_settings", "allow_researcher_session_deletion")
