"""ATLAS IELTS Academy — file-backed data store (NO DATABASE).

Personal-edition persistence: everything the old SQLAlchemy models
stored (users, profiles §10.1, day_records §10.2, history §10.3)
now lives in ONE JSON file on disk, loaded once at boot and written
through on every mutation.

Why: the app is single-user/personal — a relational database added
deploy friction (drivers, URLs, migrations) for zero benefit. The
wire shapes and route behaviour are IDENTICAL to the database era;
only the persistence underneath changed.

Honest limits (by design):
* Data survives process restarts, but on ephemeral hosts (Render
  free tier) a REDEPLOY starts a fresh disk — set DATA_FILE to a
  mounted-disk path to keep data across deploys.
* One process at a time; a threading lock guards concurrent writes.
"""

import json
import os
import threading
from datetime import datetime, timezone
from typing import Any

from app.config import settings

_LOCK = threading.RLock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


# ── Row wrappers: attribute access that writes through to the dict ──

class _Row:
    """Attribute ↔ dict bridge: services keep their model-style code
    while the underlying dict is the single source of truth serialized
    at save time."""

    def __init__(self, data: dict) -> None:
        object.__setattr__(self, "_d", data)

    @property
    def data(self) -> dict:
        return self._d


class User(_Row):
    @property
    def id(self) -> int:
        return self._d["id"]

    @property
    def email(self) -> str | None:
        return self._d.get("email")

    @email.setter
    def email(self, value: str | None) -> None:
        self._d["email"] = value

    @property
    def password_hash(self) -> str | None:
        return self._d.get("password_hash")

    @password_hash.setter
    def password_hash(self, value: str | None) -> None:
        self._d["password_hash"] = value

    @property
    def is_guest(self) -> bool:
        return bool(self._d.get("is_guest", True))

    @is_guest.setter
    def is_guest(self, value: bool) -> None:
        self._d["is_guest"] = value

    @property
    def created_at(self) -> str | None:
        return self._d.get("created_at")


class Profile(_Row):
    @property
    def user_id(self) -> int:
        return self._d["user_id"]

    @property
    def onboarded(self) -> bool:
        return bool(self._d.get("onboarded", False))

    @onboarded.setter
    def onboarded(self, v: bool) -> None:
        self._d["onboarded"] = v

    @property
    def target_band(self) -> float:
        return self._d.get("target_band", 6.5)

    @target_band.setter
    def target_band(self, v: float) -> None:
        self._d["target_band"] = v

    @property
    def phase(self) -> str:
        return self._d.get("phase", "practice")

    @phase.setter
    def phase(self, v: str) -> None:
        self._d["phase"] = v

    @property
    def day(self) -> int:
        return self._d.get("day", 1)

    @day.setter
    def day(self, v: int) -> None:
        self._d["day"] = v

    @property
    def status(self) -> str:
        return self._d.get("status", "active")

    @status.setter
    def status(self, v: str) -> None:
        self._d["status"] = v

    @property
    def streak(self) -> int:
        return self._d.get("streak", 0)

    @streak.setter
    def streak(self, v: int) -> None:
        self._d["streak"] = v

    @property
    def last_completed_date(self) -> str | None:
        return self._d.get("last_completed_date")

    @last_completed_date.setter
    def last_completed_date(self, v: str | None) -> None:
        self._d["last_completed_date"] = v

    @property
    def topics_used(self) -> dict:
        return self._d.get("topics_used") or {}

    @topics_used.setter
    def topics_used(self, v: dict) -> None:
        self._d["topics_used"] = v

    @property
    def weak_area_profile(self) -> dict:
        return self._d.get("weak_area_profile") or {}

    @weak_area_profile.setter
    def weak_area_profile(self, v: dict) -> None:
        self._d["weak_area_profile"] = v

    @property
    def vocab_deck(self) -> list:
        return self._d.get("vocab_deck") or []

    @vocab_deck.setter
    def vocab_deck(self, v: list) -> None:
        self._d["vocab_deck"] = v

    @property
    def created_at(self) -> str | None:
        return self._d.get("created_at")


class DayRecord(_Row):
    @property
    def user_id(self) -> int:
        return self._d["user_id"]

    @property
    def phase(self) -> str:
        return self._d["phase"]

    @property
    def day(self) -> int:
        return self._d["day"]

    @property
    def record(self) -> dict:
        return self._d.get("record") or {}

    @record.setter
    def record(self, v: dict) -> None:
        self._d["record"] = v


class HistoryEntry(_Row):
    _FIELD_NAMES = (
        "date", "reading", "listening", "writing", "speaking", "overall", "weak_areas",
    )

    @property
    def id(self) -> int:
        return self._d["id"]

    @property
    def phase(self) -> str:
        return self._d["phase"]

    @property
    def day(self) -> int:
        return self._d["day"]

    def __getattr__(self, name: str) -> Any:  # date/bands/weak_areas
        if name in HistoryEntry._FIELD_NAMES:
            return self._d.get(name)
        raise AttributeError(name)

    def __setattr__(self, name: str, value: Any) -> None:
        if name.startswith("_") or name not in HistoryEntry._FIELD_NAMES:
            object.__setattr__(self, name, value)
        else:
            self._d[name] = value


# ── The store itself ─────────────────────────────────────────

def _empty() -> dict:
    return {"users": [], "profiles": [], "day_records": [], "history_entries": [], "seq": 0}


def _load() -> dict:
    path = settings.data_file
    if not os.path.exists(path):
        return _empty()
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return _empty()
    if not isinstance(data, dict):
        return _empty()
    for key, value in _empty().items():
        data.setdefault(key, value)
    return data


_DATA = _load()


def save() -> None:
    """Persist the whole store atomically (tmp file + replace)."""
    with _LOCK:
        path = settings.data_file
        os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
        tmp = f"{path}.tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(_DATA, fh, ensure_ascii=False)
        os.replace(tmp, path)


def _next_id() -> int:
    _DATA["seq"] = int(_DATA.get("seq", 0)) + 1
    return _DATA["seq"]


# ── Users ────────────────────────────────────────────────────

def users_create_guest() -> User:
    row = {"id": _next_id(), "email": None, "password_hash": None,
           "is_guest": True, "created_at": _now_iso()}
    _DATA["users"].append(row)
    user = User(row)
    save()
    return user


def users_get(user_id: int) -> User | None:
    for row in _DATA["users"]:
        if row["id"] == user_id:
            user = User(row)
            user.profile = profiles_find_by_user(user_id)
            return user
    return None


def users_find_by_email(email: str) -> User | None:
    for row in _DATA["users"]:
        if row.get("email") == email:
            user = User(row)
            user.profile = profiles_find_by_user(row["id"])
            return user
    return None


# ── Profiles (§10.1) ─────────────────────────────────────────

def profiles_find_by_user(user_id: int) -> Profile | None:
    for row in _DATA["profiles"]:
        if row["user_id"] == user_id:
            return Profile(row)
    return None


def profiles_create(user_id: int, fields: dict) -> Profile:
    row = {"id": _next_id(), "user_id": user_id, "created_at": _now_iso(), **fields}
    _DATA["profiles"].append(row)
    profile = Profile(row)
    save()
    return profile


# ── Day records (§10.2) ──────────────────────────────────────

def day_records_find(user_id: int, phase: str, day: int) -> DayRecord | None:
    for row in _DATA["day_records"]:
        if row["user_id"] == user_id and row["phase"] == phase and row["day"] == day:
            return DayRecord(row)
    return None


def day_records_create(user_id: int, phase: str, day: int, record: dict) -> DayRecord:
    row = {"id": _next_id(), "user_id": user_id, "phase": phase, "day": day,
           "record": record, "created_at": _now_iso(), "updated_at": _now_iso()}
    _DATA["day_records"].append(row)
    save()
    return DayRecord(row)


# ── History entries (§10.3) ──────────────────────────────────

def history_list(user_id: int) -> list[HistoryEntry]:
    rows = [HistoryEntry(r) for r in _DATA["history_entries"] if r["user_id"] == user_id]
    rows.sort(key=lambda e: e.id)
    return rows


def history_upsert(user_id: int, phase: str, day: int, values: dict) -> HistoryEntry:
    for row in _DATA["history_entries"]:
        if row["user_id"] == user_id and row["phase"] == phase and row["day"] == day:
            row.update(values)
            entry = HistoryEntry(row)
            save()
            return entry
    row = {"id": _next_id(), "user_id": user_id, "phase": phase, "day": day, **values}
    _DATA["history_entries"].append(row)
    entry = HistoryEntry(row)
    save()
    return entry
