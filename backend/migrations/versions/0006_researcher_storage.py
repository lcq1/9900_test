"""Persist the researcher's approved storage location name."""
from alembic import op
import sqlalchemy as sa

revision = "6a6a6a6a6a6a"
down_revision = "5f5f5f5f5f5f"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("researchers", sa.Column("storage_location", sa.String(64), nullable=True))


def downgrade():
    op.drop_column("researchers", "storage_location")
