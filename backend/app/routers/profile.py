"""ATLAS IELTS Academy — profile routes (§10.1).

No response_model: the camelCase dicts from profile_service pass
through untouched (a response_model would strip nothing today, but
dict-return keeps the pass-through contract explicit for future
additive fields).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import ProfileData
from app.services.profile_service import apply_profile_update, get_or_create_profile, profile_to_dict

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("")
async def get_profile(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    # Creates on first read — the guest bootstrap lands here before onboarding.
    return profile_to_dict(get_or_create_profile(db, user))


@router.put("")
async def update_profile(
    data: ProfileData,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return profile_to_dict(apply_profile_update(db, user, data))