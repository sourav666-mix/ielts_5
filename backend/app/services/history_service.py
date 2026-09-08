"""ATLAS IELTS Academy — history persistence (spec §10.3).

One entry per COMPLETED day, appended by day_service.advance_day.
Ordering is by id — insertion order = completion order, which is
exactly the chronological order the frontend's trend chart and
milestone narratives expect (§2.4, §8.5).

Database-free: entries live in the file-backed store (store.py);
upserts persist immediately.
"""

from typing import Any

from app.store import HistoryEntry, history_list, history_upsert


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


def list_entries(user_id: int) -> list[dict]:
    return [entry_to_dict(entry) for entry in history_list(user_id)]


def append_entry(
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
    retried advance can never duplicate a day. Persists immediately."""
    values: dict[str, Any] = {
        "date": date,
        "reading": reading,
        "listening": listening,
        "writing": writing,
        "speaking": speaking,
        "overall": overall,
        "weak_areas": weak_areas,
    }
    return history_upsert(user_id, phase, day, values)
