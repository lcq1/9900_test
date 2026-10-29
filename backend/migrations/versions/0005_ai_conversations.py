"""Store AI context on the server without resending browser chat history."""
from alembic import op
import sqlalchemy as sa

revision = "5f5f5f5f5f5f"
down_revision = "4e4e4e4e4e4e"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("researcher_id", sa.String(36), sa.ForeignKey("researchers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("experiment_id", sa.String(36), sa.ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stage_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.String(64), nullable=False),
    )
    op.create_index("ix_ai_conversations_experiment_id", "ai_conversations", ["experiment_id"])
    op.create_table(
        "ai_chat_turns",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("conversation_id", sa.String(36), sa.ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_id", sa.String(36), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("reply", sa.Text(), nullable=False),
        sa.Column("model", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("created_at", sa.String(64), nullable=False),
        sa.UniqueConstraint("conversation_id", "request_id", name="uq_ai_turn_request"),
        sa.UniqueConstraint("conversation_id", "sequence", name="uq_ai_turn_sequence"),
    )


def downgrade():
    op.drop_table("ai_chat_turns")
    op.drop_index("ix_ai_conversations_experiment_id", table_name="ai_conversations")
    op.drop_table("ai_conversations")
