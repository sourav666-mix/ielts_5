"""ATLAS IELTS Academy — history persistence (spec §10.3).

One row per COMPLETED day, appended by day_service.advance_day.
Ordering is by id — insertion order = completion order, which is
exactly the chronological order the frontend's trend chart and
milestone narratives expect (§2.4, §8.5).

append_entry does NOT commit: the advance transition owns the
transaction so the history row, profile update and next-day record
land together.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import HistoryEntry


def entry_to_dict(entry: HistoryEntry) -> dict:
    """§10.3 wire shape + the additive weakAreas snapshot (§8.5)."""
    return {
        "phase": entry.phase,
        "day": entry.day,
        "date": entry.date,
        "reading": entry.reading,
        "listening": entry.listening,
        "writing": entry.writing,
        "speaking": entry.speaking,
        "overall": entry.overall,
        "weakAreas": entry.weak_areas,
    }


def list_entries(db: Session, user_id: int) -> list[dict]:
    rows = db.execute(
        select(HistoryEntry)
        .where(HistoryEntry.user_id == user_id)
        .order_by(HistoryEntry.id)
    ).scalars().all()
    return [entry_to_dict(row) for row in rows]


def append_entry(
    db: Session,
    user_id: int,
    *,
    phase: str,
    day: int,
    date: str,
    reading: float,
    listening: float,
    writing: float,
    speaking: float,
    overall: float,
    weak_areas: dict | None = None,
) -> HistoryEntry:
    """Append-or-update, keyed by (user, phase, day) — idempotent so a
    retried advance can never duplicate a day. No commit (see docstring)."""
    row = db.execute(
        select(HistoryEntry).where(
            HistoryEntry.user_id == user_id,
            HistoryEntry.phase == phase,
            HistoryEntry.day == day,
        )
    ).scalar_one_or_none()

    values: dict[str, Any] = {
        "date": date,
        "reading": reading,
        "listening": listening,
        "writing": writing,
        "speaking": speaking,
        "overall": overall,
        "weak_areas": weak_areas,
    }
    if row is None:
        row = HistoryEntry(
            user_id=user_id, phase=phase, day=day, **values
        )
        db.add(row)
    else:
        for key, value in values.items():
            setattr(row, key, value)
    return row