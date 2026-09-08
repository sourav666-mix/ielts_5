"""ATLAS IELTS Academy — ORM models.

Four tables, mirroring migration 0001 exactly:

    users            auth; guest-first (email/password NULL for guests)
    profiles         §10.1 — one row per user for the whole programme
    day_records      §10.2 — one row per (user, phase, day); the full
                     normalised record rides in a single JSON column
                     (the frontend is the shape authority; the backend
                     is durable storage + the authoritative §2.3 advance)
    history_entries  §10.3 — one row per COMPLETED day (+ additive
                     weak_areas snapshot powering §8.5 milestones)

Additive fields (reading.warmupsDone, listening.plays, history
weakAreas, etc.) live inside the record JSON by design — no schema
churn for frontend-internal bookkeeping.

Dates are ISO 'YYYY-MM-DD' strings (String(10)): the frontend's
streak logic is LOCAL-calendar-based (Batch 2), and round-tripping
strings preserves that exactly, with zero timezone ambiguity.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    """Naive UTC — see database.py's discipline notes."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── users ─────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    # MySQL unique indexes allow multiple NULLs → unlimited guests. ✓
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    profile: Mapped["Profile"] = relationship(
        back_populates="user", uselist=False,
        cascade="all, delete-orphan", lazy="joined",
    )
    day_records: Mapped[list["DayRecord"]] = relationship(
        back_populates="user", cascade="all, delete-orphan",
    )
    history_entries: Mapped[list["HistoryEntry"]] = relationship(
        back_populates="user", cascade="all, delete-orphan",
    )


# ── profiles (§10.1) ──────────────────────────────────────────

class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE", name="fk_profiles_users_user_id"),
        nullable=False,
    )
    onboarded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    target_band: Mapped[float] = mapped_column(Float, nullable=False, default=6.5)
    phase: Mapped[str] = mapped_column(String(16), nullable=False, default="practice")
    day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_completed_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    topics_used: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    weak_area_profile: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    vocab_deck: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    __table_args__ = (UniqueConstraint("user_id", name="uq_profiles_user_id"),)

    user: Mapped["User"] = relationship(back_populates="profile")


# ── day_records (§10.2) ───────────────────────────────────────

class DayRecord(Base):
    __tablename__ = "day_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE", name="fk_day_records_users_user_id"),
        nullable=False,
    )
    phase: Mapped[str] = mapped_column(String(16), nullable=False)
    day: Mapped[int] = mapped_column(Integer, nullable=False)
    # Full §10.2 record (content, answers, scores, additive fields).
    # ⚠ Assign fresh dicts — JSON columns don't track mutation.
    record: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    __table_args__ = (
        UniqueConstraint("user_id", "phase", "day", name="uq_day_records_user_phase_day"),
    )

    user: Mapped["User"] = relationship(back_populates="day_records")


# ── history_entries (§10.3) ───────────────────────────────────

class HistoryEntry(Base):
    __tablename__ = "history_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE", name="fk_history_entries_users_user_id"),
        nullable=False,
    )
    phase: Mapped[str] = mapped_column(String(16), nullable=False)
    day: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    # Nullable bands — the reader filters non-finite; never fabricate 0.0.
    reading: Mapped[float | None] = mapped_column(Float, nullable=True)
    listening: Mapped[float | None] = mapped_column(Float, nullable=True)
    writing: Mapped[float | None] = mapped_column(Float, nullable=True)
    speaking: Mapped[float | None] = mapped_column(Float, nullable=True)
    overall: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Additive §8.5 field: weak-area snapshot at advance time.
    weak_areas: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "phase", "day", name="uq_history_entries_user_phase_day"),
    )

    user: Mapped["User"] = relationship(back_populates="history_entries")