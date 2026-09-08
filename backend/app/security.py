"""ATLAS IELTS Academy — security: JWT tokens + password hashing.

Password hashing is deliberately STDLIB: hashlib.pbkdf2_hmac with
SHA-256 and 600,000 iterations (the OWASP-recommended work factor)
— one fewer supply-chain dependency than passlib/bcrypt, and the
hash format fits comfortably in the models' String(255):

    pbkdf2_sha256$600000$<salt_hex>$<hash_hex>          (~151 chars)

JWT: python-jose, HS256, 30-day access tokens. `sub` carries the
user id as a string (JWT best practice).
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.config import settings

PBKDF2_ITERATIONS = 600_000


# ── Passwords ────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored or not isinstance(stored, str):
        return False
    try:
        scheme, iterations, salt_hex, hash_hex = stored.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), hash_hex)


# ── Tokens ───────────────────────────────────────────────────

def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user_id), "iat": now, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> int | None:
    """User id on success; None on ANY failure — deps.py writes the warm 401."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        if payload.get("type") != "access":
            return None
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError, TypeError):
        return None