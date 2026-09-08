"""ATLAS IELTS Academy — Pydantic schemas (first slice).

The wire contract is File 14 (frontend/src/lib/api.js) — verified
field-by-field in the batch double-check.

CASING RULES
────────────
* The frontend speaks camelCase (targetBand, timeSpentSec, …).
  CamelModel uses pydantic's to_camel alias generator; FastAPI
  serialises response models WITH aliases by default
  (response_model_by_alias=True — main.py never disables it), and
  populate_by_name lets a client send either casing.
* EXCEPTION: the auth token is snake_case — File 14 destructures
  `const { access_token } = …` — so TokenOut is a plain model.

PASS-THROUGH DISCIPLINE
───────────────────────
extra="allow" on the day/profile models: the frontend is the shape
authority for generated content (Batches 5–8 normalisers), and the
backend must round-trip fields it doesn't model (reading.warmupsDone,
listening.plays, speaking round internals, …). NOTE: additive fields
on the PROFILE itself need a schema+column change here — extras are
preserved on the round-trip object but only modelled columns persist.
No such fields exist today; stated so nobody is surprised later.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """camelCase on the wire, either casing accepted on input."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="allow",
    )


# ── Auth ──────────────────────────────────────────────────────
# ⚠ snake_case on purpose — see module docstring.

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v: str) -> str:
        v = v.strip().lower()
        if len(v) > 255 or "@" not in v or "." not in v.rsplit("@", 1)[-1]:
            raise ValueError("That doesn’t look like a valid email address.")
        return v

    @field_validator("password")
    @classmethod
    def _password_shape(cls, v: str) -> str:
        if not 8 <= len(v) <= 128:
            raise ValueError("Passwords need to be 8–128 characters.")
        return v


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str | None = None
    is_guest: bool


# ── Profile (§10.1) ───────────────────────────────────────────

class VocabCard(CamelModel):
    """SRS card — matches frontend srs.js makeCard field-for-field."""

    word: str
    definition: str = ""
    example: str = ""
    related: str = ""
    first_seen_day: int = 0
    interval: int = 0
    due_date: str = ""
    lapses: int = 0
    reviews: int = 0


class ProfileData(CamelModel):
    """§10.1 — covers every field of the frontend's emptyProfile()."""

    onboarded: bool = False
    target_band: float = Field(default=6.5, ge=6.0, le=9.0)   # §1: 6.0 → 9.0+
    phase: Literal["practice", "mock"] = "practice"
    day: int = Field(default=1, ge=1)
    status: Literal["active", "complete"] = "active"
    streak: int = Field(default=0, ge=0)
    last_completed_date: str | None = None                     # 'YYYY-MM-DD'
    topics_used: dict[str, Any] = Field(default_factory=dict)
    weak_area_profile: dict[str, Any] = Field(default_factory=dict)
    vocab_deck: list[VocabCard] = Field(default_factory=list)
    created_at: str | None = None                              # ISO, round-tripped


# ── Day record (§10.2) ────────────────────────────────────────
# The envelope is validated; content/answers/scores/additive fields
# pass through untouched. The router (Batch 11) additionally checks
# path (phase, day) == body (phase, day) → 409 on mismatch.

class ModuleData(CamelModel):
    """status is the one field the backend MUST be able to trust —
    it drives the §2.3 advance gate."""

    status: Literal["todo", "progress", "done"]


class DayRecordData(CamelModel):
    phase: Literal["practice", "mock"]
    day: int = Field(ge=1)
    reading: ModuleData
    listening: ModuleData
    writing: ModuleData
    speaking: ModuleData


# ── History (§10.3) ───────────────────────────────────────────

class HistoryEntryData(CamelModel):
    """One COMPLETED day. `weak_areas` is the additive §8.5 snapshot
    the frontend's milestone narratives read."""

    phase: Literal["practice", "mock"]
    day: int = Field(ge=1)
    date: str                                                   # 'YYYY-MM-DD'
    reading: float | None = Field(default=None, ge=0, le=9)
    listening: float | None = Field(default=None, ge=0, le=9)
    writing: float | None = Field(default=None, ge=0, le=9)
    speaking: float | None = Field(default=None, ge=0, le=9)
    overall: float | None = Field(default=None, ge=0, le=9)
    weak_areas: dict[str, Any] | None = None