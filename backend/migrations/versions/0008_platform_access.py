"""Add researcher approval, study access codes and storage disclosure."""
from alembic import op
import sqlalchemy as sa

revision = "8d8d8d8d8d8d"
down_revision = "7c7c7c7c7c7c"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("researchers", sa.Column("account_status", sa.String(16), nullable=False, server_default="active"))
    op.add_column("researchers", sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("platform_settings", sa.Column("require_researcher_approval", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("platform_settings", sa.Column("default_storage_location", sa.String(64), nullable=True))
    op.add_column("experiments", sa.Column("storage_notice", sa.Text(), nullable=False, server_default=""))
    op.create_table(
        "study_access_codes",
        sa.Column("experiment_id", sa.String(36), sa.ForeignKey("experiments.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("code", sa.String(64), primary_key=True),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_table("study_access_codes")
    op.drop_column("experiments", "storage_notice")
    op.drop_column("platform_settings", "default_storage_location")
    op.drop_column("platform_settings", "require_researcher_approval")
    op.drop_column("researchers", "auth_version")
    op.drop_column("researchers", "account_status")
