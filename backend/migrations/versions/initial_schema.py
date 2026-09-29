"""Establish the initial Alembic baseline.

Revision ID: 0001_initial_schema
Revises: None

Concrete tables are created in the following domain migrations.
"""

from collections.abc import Sequence


revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Record the baseline revision without creating tables."""


def downgrade() -> None:
    """Remove the baseline marker after later revisions are downgraded."""
