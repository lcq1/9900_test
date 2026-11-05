"""Security helpers: password hashing, JWT issue/decode and auth dependency."""

from __future__ import annotations

from app.core import clock

from datetime import timedelta
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.researcher.models import Researcher

# bcrypt backend (pinned to 4.0.1 for passlib 1.7.4 compatibility).
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=True)

CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def hash_password(password: str) -> str:
    """Return a bcrypt hash for ``password``."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify ``plain`` against a bcrypt ``hashed`` value (never raises)."""
    try:
        return pwd_context.verify(plain, hashed)
    except (ValueError, TypeError):
        return False


def create_access_token(subject: str, auth_version: int = 0) -> str:
    """Create a signed JWT for ``subject`` (the researcher id)."""
    now = clock.now()
    expire = now + timedelta(minutes=settings.jwt_expire_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "ver": auth_version,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _access_claims(token: str) -> dict | None:
    """Decode a JWT and return the ``sub`` claim, or ``None`` if invalid."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except jwt.PyJWTError:
        return None
    return payload


def decode_access_token(token: str) -> str | None:
    return (_access_claims(token) or {}).get("sub")


def get_current_researcher(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Researcher:
    """FastAPI dependency returning the authenticated researcher or 401."""
    claims = _access_claims(token) or {}
    subject = claims.get("sub")
    if subject is None:
        raise CREDENTIALS_EXC
    researcher = db.get(Researcher, subject)
    if researcher is None or researcher.account_status != "active" or claims.get("ver", 0) != researcher.auth_version:
        raise CREDENTIALS_EXC
    from app.core.config import require_allowed_email
    require_allowed_email(researcher.email)
    return researcher


def get_current_administrator(
    researcher: Researcher = Depends(get_current_researcher),
) -> Researcher:
    if researcher.role != "administrator":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return researcher
