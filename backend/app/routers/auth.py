"""ATLAS IELTS Academy — auth routes.

Guest-first: the frontend's bootstrap creates a guest account before
anything else, so no route ever blocks on registration. Register
UPGRADES the current guest in place — 30 days of progress travel
with the account, per Batch 9's schema promise.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import LoginIn, RegisterIn, TokenOut, UserOut
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/guest", response_model=TokenOut)
async def create_guest(db: Session = Depends(get_db)) -> TokenOut:
    """A fresh anonymous account — the app's default path (§ File 14 bootstrap)."""
    user = User(is_guest=True)
    db.add(user)
    db.commit()
    return TokenOut(access_token=create_access_token(user.id))


@router.post("/register", response_model=TokenOut)
async def register(
    data: RegisterIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenOut:
    """Upgrade the CURRENT guest to a full account, keeping all progress."""
    if not user.is_guest:
        raise HTTPException(
            status_code=409,
            detail="This account already has an email and password — sign in with those.",
        )
    existing = db.execute(select(User).where(User.email == data.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="That email is already registered — try signing in with it instead.",
        )
    user.email = data.email
    user.password_hash = hash_password(data.password)
    user.is_guest = False
    db.commit()
    return TokenOut(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenOut)
async def login(data: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    user = db.execute(select(User).where(User.email == data.email)).scalar_one_or_none()
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