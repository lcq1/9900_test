"""Password hashing, session cookies and role authorization helpers."""

from typing import Literal

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import HTTPException, Request, Response, status

from .config import get_settings


password_hasher = PasswordHasher()
Role = Literal["researcher", "participant", "administrator"]


def hash_secret(secret: str) -> str:
    """Create an Argon2id hash; callers must discard the plaintext promptly."""

    return password_hasher.hash(secret)


def verify_secret(secret_hash: str, supplied_secret: str) -> bool:
    """Verify without revealing whether an account or code exists."""

    try:
        return password_hasher.verify(secret_hash, supplied_secret)
    except (VerifyMismatchError, InvalidHashError):
        return False


def set_session_cookie(response: Response, session_id: str) -> None:
    """Set an opaque server-session identifier with hardened cookie flags."""

    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )


def require_role(request: Request, expected: Role) -> None:
    """Placeholder role guard; replace header lookup with session repository data."""

    # Never trust a client-supplied role in production. This deliberately blocks
    # protected routes until server-side session resolution is implemented.
    _ = request
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=f"{expected} session guard is not implemented")
