"""ATLAS IELTS Academy — profile persistence (spec §10.1).

CASING: the stored JSON blobs (vocabDeck, topicsUsed,
weakAreaProfile) are camelCase — the frontend's native shape.
ProfileData parses camelCase input; vocab cards are re-dumped
by_alias so the stored deck stays camelCase field-for-field with
frontend srs.js cards.

createdAt is SERVER-OWNED: client values are ignored on write;
reads return the ORM timestamp as ISO with a Z suffix (shape parity
with the frontend's toISOString()).

Trust boundary, stated plainly: PUT /profile is trusted-client
persistence (single-user product, our own frontend). The §2.3
advance endpoint remains the AUTHORITATIVE gate for streak, phase
rollover and history — a profile PUT alone can never write those.
"""

from sqlalchemy.orm import Session

from app.models import Profile, User
from app.schemas import ProfileData

_TOPICS_KEYS = ("reading", "listening", "writing", "speaking")


def _default_topics() -> dict:
    return {key: [] for key in _TOPICS_KEYS}


def _default_weak_areas() -> dict:
    return {key: {} for key in _TOPICS_KEYS}


def get_or_create_profile(db: Session, user: User) -> Profile:
    """Guaranteed to exist after this call. Creation is its own
    transaction (a GET that creates must persist)."""
    if user.profile is not None:
        return user.profile
    profile = Profile(
        user_id=user.id,
        onboarded=False,
        target_band=6.5,
        phase="practice",
        day=1,
        status="active",
        streak=0,
        last_completed_date=None,
        topics_used=_default_topics(),
        weak_area_profile=_default_weak_areas(),
        vocab_deck=[],
    )
    # Assign via the relationship so the in-memory User stays consistent
    # (expire_on_commit=False would otherwise keep user.profile None).
    user.profile = profile
    db.add(profile)
    db.commit()
    return profile


def profile_to_dict(profile: Profile) -> dict:
    """§10.1 wire shape — camelCase, mirrors frontend emptyProfile()."""
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
        "createdAt": (
            profile.created_at.isoformat() + "Z" if profile.created_at else None
        ),
    }


def apply_profile_update(db: Session, user: User, data: ProfileData) -> Profile:
    """Write the modelled columns; fresh-object assignment for JSON blobs
    (mutation discipline). Extras are accepted by the schema but only
    modelled columns persist — see schemas.py's note."""
    profile = get_or_create_profile(db, user)

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

    db.commit()
    return profile