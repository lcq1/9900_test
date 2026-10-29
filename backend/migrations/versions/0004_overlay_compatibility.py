"""Upgrade existing installations without rewriting their migration history.

The backup's 0001 includes ownership, but databases created by the original
project may already be at 0003 without that column. Keep all rows intact.
"""
from alembic import op
import sqlalchemy as sa

revision = "4e4e4e4e4e4e"
down_revision = "3c3c3c3c3c3c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("experiments")}
    if "owner_id" not in columns:
        op.add_column("experiments", sa.Column("owner_id", sa.String(36), nullable=True))
        op.create_foreign_key("fk_experiment_owner", "experiments", "researchers", ["owner_id"], ["id"])
        op.create_index("ix_experiments_owner_id", "experiments", ["owner_id"])
    op.alter_column("participant_events", "epoch_ms", existing_type=sa.Integer(), type_=sa.BigInteger())


def downgrade() -> None:
    # Real captured timestamps exceed INTEGER. Reject a narrowing conversion
    # rather than truncating saved research data; ownership remains in 0001.
    largest = op.get_bind().execute(sa.text("SELECT max(abs(epoch_ms)) FROM participant_events")).scalar()
    if largest is not None and largest > 2147483647:
        raise RuntimeError("Cannot narrow epoch_ms while millisecond timestamps are stored")
    op.alter_column("participant_events", "epoch_ms", existing_type=sa.BigInteger(), type_=sa.Integer())
