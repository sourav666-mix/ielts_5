"""ATLAS IELTS Academy — initial schema.

Spec §10 data model (profiles §10.1, day records §10.2, history
§10.3) plus the auth `users` table (guest-first accounts).

Mirrors app/models.py column-for-column — verified in the batch
double-check. All constraint names are explicit and match the
models exactly, so future autogenerate diffs stay clean.

Revision ID: 0001
Revises:
Create Date: 2026-01-01 00:00:00 UTC
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users (auth; guests have NULL email/password) ─────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("is_guest", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    # ── profiles (§10.1 — one row per user, forever) ──────────
    op.create_table(
        "profiles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("onboarded", sa.Boolean(), nullable=False),
        sa.Column("target_band", sa.Float(), nullable=False),
        sa.Column("phase", sa.String(length=16), nullable=False),
        sa.Column("day", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("streak", sa.Integer(), nullable=False),
        sa.Column("last_completed_date", sa.String(length=10), nullable=True),
        sa.Column("topics_used", sa.JSON(), nullable=False),
        sa.Column("weak_area_profile", sa.JSON(), nullable=False),
        sa.Column("vocab_deck", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_profiles")),
        sa.UniqueConstraint("user_id", name="uq_profiles_user_id"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_profiles_users_user_id", ondelete="CASCADE",
        ),
    )

    # ── day_records (§10.2 — one row per user/phase/day) ──────
    op.create_table(
        "day_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("phase", sa.String(length=16), nullable=False),
        sa.Column("day", sa.Integer(), nullable=False),
        sa.Column("record", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_day_records")),
        sa.UniqueConstraint("user_id", "phase", "day",
                            name="uq_day_records_user_phase_day"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_day_records_users_user_id", ondelete="CASCADE",
        ),
    )

    # ── history_entries (§10.3 — one row per COMPLETED day) ───
    # Module bands + overall are nullable: the reader (frontend
    # trend/milestones) already filters non-finite values, and a
    # defensive NULL beats a fabricated 0.0 in a band column.
    op.create_table(
        "history_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("phase", sa.String(length=16), nullable=False),
        sa.Column("day", sa.Integer(), nullable=False),
        sa.Column("date", sa.String(length=10), nullable=False),
        sa.Column("reading", sa.Float(), nullable=True),
        sa.Column("listening", sa.Float(), nullable=True),
        sa.Column("writing", sa.Float(), nullable=True),
        sa.Column("speaking", sa.Float(), nullable=True),
        sa.Column("overall", sa.Float(), nullable=True),
        sa.Column("weak_areas", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_history_entries")),
        sa.UniqueConstraint("user_id", "phase", "day",
                            name="uq_history_entries_user_phase_day"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_history_entries_users_user_id", ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    # Reverse dependency order.
    op.drop_table("history_entries")
    op.drop_table("day_records")
    op.drop_table("profiles")
    op.drop_table("users")