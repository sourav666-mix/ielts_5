"""ATLAS IELTS Academy — history route (§10.3).

Returns a bare JSON array (File 14 / history store read it directly).
Ordering: insertion order = completion order (history_service).
"""

from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.services import history_service
from app.store import User

router = APIRouter(prefix="/history", tags=["history"])


@router.get("")
async def list_history(
    user: User = Depends(get_current_user),
) -> list:
    return history_service.list_entries(user.id)