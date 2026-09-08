"""ATLAS IELTS Academy — auth routes.

Guest-first: the frontend's bootstrap creates a guest account before
anything else, so no route ever blocks on registration. Register
UPGRADES the current guest in place — all progress travels with the
account. Database-free: accounts live in the file-backed store.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user
from app.schemas import LoginIn, RegisterIn, TokenOut, UserOut
from app.security import create_access_token, hash_password, verify_password
from app.store import User, save, users_create_guest, users_find_by_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/guest", response_model=TokenOut)
async def create_guest() -> TokenOut:
    """A fresh anonymous account — the app's default path (§ File 14 bootstrap)."""
    user = users_create_guest()
    return TokenOut(access_token=create_access_token(user.id))


@router.post("/register", response_model=TokenOut)
async def register(
    data: RegisterIn,
    user: User = Depends(get_current_user),
) -> TokenOut:
    """Upgrade the CURRENT guest to a full account, keeping all progress."""
    if not user.is_guest:
        raise HTTPException(
            status_code=409,
            detail="This account already has an email and password — sign in with those.",
        )
    if users_find_by_email(data.email) is not None:
        raise HTTPException(
            status_code=409,
            detail="That email is already registered — try signing in with it instead.",
        )
    user.email = data.email
    user.password_hash = hash_password(data.password)
    user.is_guest = False
    save()
    return TokenOut(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenOut)
async def login(data: LoginIn) -> TokenOut:
    user = users_find_by_email(data.email)
    if user is None or not verify_password(data.password, user.password_hash):
        # Same message for unknown email and wrong password — no account enumeration.
        raise HTTPException(
            status_code=401,
            detail="That email and password don't match — check them and try again.",
        )
    return TokenOut(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut(id=user.id, email=user.email, is_guest=user.is_guest)
