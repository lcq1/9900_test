"""Create researchers and experiments, including experiment ownership.

Alembic manages schema creation; application startup only checks connectivity.
"""
from alembic import op
import sqlalchemy as sa

revision = "1a1a1a1a1a1a"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "researchers",
        sa.Column(
            "id",
            sa.String(36),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="researcher"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_table(
        "experiments",
        sa.Column(
            "id",
            sa.String(36),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("owner_id", sa.String(36), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="Draft"),
        sa.Column("created", sa.String(32), nullable=True),
        sa.Column("full_screen", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("stages", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["researchers.id"], name="fk_experiment_owner"
        ),
    )
    op.create_index("ix_experiments_owner_id", "experiments", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_experiments_owner_id", table_name="experiments")
    op.drop_table("experiments")
    op.drop_table("researchers")
