"""ATLAS IELTS Academy — auth dependency.

`get_current_user` is the single gate every protected router uses.
401s carry warm, actionable copy (the frontend surfaces `detail`
verbatim — Batch 2's throwApiError reads detail.detail).

The User relationship loads `profile` joined (models.py), so
routers can read user.profile without an extra query.
"""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="You're not signed in — reload the page to start a fresh session.",
        )
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail="Your session expired — reload the page to sign back in.",
        )
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="That account no longer exists — reload to start a fresh session.",
        )
    return user