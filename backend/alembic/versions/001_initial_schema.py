"""Initial schema — create sessions and soap_notes tables.

Revision ID: 001
Revises:
Create Date: 2026-03-25 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# ---------------------------------------------------------------------------
# Revision identifiers (used by Alembic)
# ---------------------------------------------------------------------------
revision = "001"
down_revision = None  # This is the first migration
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Upgrade: create tables
# ---------------------------------------------------------------------------

def upgrade() -> None:
    # --- sessions ------------------------------------------------------------
    op.create_table(
        "sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default="recording",
            comment="One of: recording | paused | processing | completed | failed",
        ),
        sa.Column("audio_s3_key", sa.String(), nullable=True),
        sa.Column("raw_transcript", sa.Text(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
    )

    # --- soap_notes ----------------------------------------------------------
    op.create_table(
        "soap_notes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,  # one SOAP note per session
        ),
        sa.Column("subjective", sa.Text(), nullable=False),
        sa.Column("objective", sa.Text(), nullable=False),
        sa.Column("assessment", sa.Text(), nullable=False),
        sa.Column("plan", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


# ---------------------------------------------------------------------------
# Downgrade: drop tables in reverse dependency order
# ---------------------------------------------------------------------------

def downgrade() -> None:
    op.drop_table("soap_notes")
    op.drop_table("sessions")
