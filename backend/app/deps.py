"""ATLAS IELTS Academy — auth dependency.

`get_current_user` is the single gate every protected router uses.
401s carry warm, actionable copy (the frontend surfaces `detail`
verbatim — Batch 2's throwApiError reads detail.detail).

Database-free: the user (with its .profile attached) comes from the
file-backed store (store.py).
"""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.security import decode_access_token
from app.store import User, users_get

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
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
    user = users_get(user_id)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="That account no longer exists — reload to start a fresh session.",
        )
    return user