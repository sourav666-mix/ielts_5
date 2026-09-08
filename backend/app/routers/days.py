"""ATLAS IELTS Academy — day-record routes (§10.2 + §2.3).

GET is deliberately unrestricted to (phase, day): the retrieval
warm-up (§8.3) reads the PREVIOUS day's record. PUT is restricted
to the CURRENT (profile.phase, profile.day) — the only day the
frontend writes, and the only one a stale tab could corrupt.
POST /days/advance is the single authoritative §2.3 transition.
"""

from fastapi import APIRouter, Depends, HTTPException, Path

from app.deps import get_current_user
from app.schemas import DayRecordData
from app.services import day_service
from app.store import User

router = APIRouter(prefix="/days", tags=["days"])

_PHASES = ("practice", "mock")


def _validate_phase(phase: str) -> None:
    if phase not in _PHASES:
        raise HTTPException(
            status_code=404,
            detail="That programme phase doesn't exist — refresh the page and try again.",
        )


@router.get("/{phase}/{day}")
async def get_day(
    phase: str,
    day: int = Path(ge=1),
    user: User = Depends(get_current_user),
) -> dict:
    _validate_phase(phase)
    row = day_service.get_or_create_day(user.id, phase, day)
    return row.record


@router.put("/{phase}/{day}")
async def put_day(
    phase: str,
    day: int = Path(ge=1),
    data: DayRecordData = None,
    user: User = Depends(get_current_user),
) -> dict:
    _validate_phase(phase)
    if user.profile is None or (user.profile.phase, user.profile.day) != (phase, day):
        raise HTTPException(
            status_code=409,
            detail=(
                "Your day record and today's programme disagree — refresh the page and "
                "it usually sorts itself out. Everything you finished is saved."
            ),
        )
    return day_service.put_day(user.id, phase, day, data)


@router.post("/advance")
async def advance_day(
    user: User = Depends(get_current_user),
) -> dict:
    """Server-authoritative §2.3 advance → {profile, day, history} (File 18 adopts all three)."""
    return day_service.advance_day(user)