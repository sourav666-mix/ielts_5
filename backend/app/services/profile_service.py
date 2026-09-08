"""ATLAS IELTS Academy — profile persistence (spec §10.1).

CASING: the stored blobs (vocabDeck, topicsUsed, weakAreaProfile)
are camelCase — the frontend's native shape. ProfileData parses
camelCase input; vocab cards are re-dumped by_alias so the stored
deck stays camelCase field-for-field with frontend srs.js cards.

createdAt is SERVER-OWNED: client values are ignored on write;
reads return the stored ISO timestamp with a Z suffix (shape parity
with the frontend's toISOString()).

Trust boundary, stated plainly: PUT /profile is trusted-client
persistence (single-user product, our own frontend). The §2.3
advance endpoint remains the AUTHORITATIVE gate for streak, phase
rollover and history — a profile PUT alone can never write those.

Database-free: profiles live in the file-backed store (store.py).
"""

from app.schemas import ProfileData
from app.store import Profile, User, profiles_create, profiles_find_by_user, save

_TOPICS_KEYS = ("reading", "listening", "writing", "speaking")


def _default_topics() -> dict:
    return {key: [] for key in _TOPICS_KEYS}


def _default_weak_areas() -> dict:
    return {key: {} for key in _TOPICS_KEYS}


def get_or_create_profile(user: User) -> Profile:
    """Guaranteed to exist after this call. Creation persists immediately."""
    if user.profile is not None:
        return user.profile
    profile = profiles_create(
        user.id,
        {
            "onboarded": False,
            "target_band": 6.5,
            "phase": "practice",
            "day": 1,
            "status": "active",
            "streak": 0,
            "last_completed_date": None,
            "topics_used": _default_topics(),
            "weak_area_profile": _default_weak_areas(),
            "vocab_deck": [],
        },
    )
    # Keep the in-memory user consistent (the old ORM did this via the
    # relationship; here it's a plain attribute).
    user.profile = profile
    return profile


def profile_to_dict(profile: Profile) -> dict:
    """§10.1 wire shape — camelCase, mirrors frontend emptyProfile()."""
    created = profile.created_at
    return {
        "onboarded": profile.onboarded,
        "targetBand": profile.target_band,
        "phase": profile.phase,
        "day": profile.day,
        "status": profile.status,
        "streak": profile.streak,
        "lastCompletedDate": profile.last_completed_date,
        "topicsUsed": profile.topics_used or _default_topics(),
        "weakAreaProfile": profile.weak_area_profile or _default_weak_areas(),
        "vocabDeck": profile.vocab_deck or [],
        "createdAt": (created + "Z" if created and not created.endswith("Z") else created),
    }


def apply_profile_update(user: User, data: ProfileData) -> Profile:
    """Write the modelled fields; fresh-object assignment for blobs.
    Extras are accepted by the schema but only modelled fields persist
    — see schemas.py's note."""
    profile = get_or_create_profile(user)

    profile.onboarded = data.onboarded
    profile.target_band = data.target_band
    profile.phase = data.phase
    profile.day = data.day
    profile.status = data.status
    profile.streak = data.streak
    profile.last_completed_date = data.last_completed_date
    profile.topics_used = dict(data.topics_used or _default_topics())
    profile.weak_area_profile = dict(data.weak_area_profile or _default_weak_areas())
    profile.vocab_deck = [card.model_dump(by_alias=True) for card in data.vocab_deck]

    save()
    return profile


__all__ = [
    "apply_profile_update",
    "get_or_create_profile",
    "profile_to_dict",
    "profiles_find_by_user",
]
