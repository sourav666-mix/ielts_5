"""ATLAS IELTS Academy — history route (§10.3).

Returns a bare JSON array (File 14 / history store read it directly).
Ordering: insertion order = completion order (history_service).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.services import history_service

router = APIRouter(prefix="/history", tags=["history"])


@router.get("")
async def list_history(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list:
    return history_service.list_entries(db, user.id)