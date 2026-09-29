"""Password hashing, opaque server sessions and role authorization."""

import hashlib
import hmac
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy import DateTime, String, delete
from sqlalchemy.orm import Mapped, Session, mapped_column

from .config import get_settings
from .database import Base, get_db


Role = Literal["researcher", "participant", "administrator"]
password_hasher = PasswordHasher()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AuthSession(Base):
    """Opaque browser session for any authenticated role."""

    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    role: Mapped[str] = mapped_column(String(32), index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


@dataclass(frozen=True)
class SessionIdentity:
    """Trusted identity resolved exclusively from the server-side session."""

    session_id: uuid.UUID
    role: Role
    subject_id: uuid.UUID


def hash_secret(secret: str) -> str:
    return password_hasher.hash(secret)


def verify_secret(secret_hash: str, supplied_secret: str) -> bool:
    if not secret_hash:
        return False
    try:
        return password_hasher.verify(secret_hash, supplied_secret)
    except (VerifyMismatchError, InvalidHashError):
        return False


def code_digest(code: str) -> str:
    """Create a deterministic keyed digest for indexed Participant Code lookup."""

    key = get_settings().app_secret_key.encode("utf-8")
    return hmac.new(key, code.encode("utf-8"), hashlib.sha256).hexdigest()


def create_auth_session(db: Session, *, role: Role, subject_id: uuid.UUID) -> AuthSession:
    settings = get_settings()
    session = AuthSession(
        role=role,
        subject_id=subject_id,
        expires_at=utc_now() + timedelta(seconds=settings.session_ttl_seconds),
    )
    db.add(session)
    db.flush()
    return session


def set_session_cookie(response: Response, session_id: uuid.UUID) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=str(session_id),
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def get_identity(
    db: Session = Depends(get_db),
    session_cookie: str | None = Cookie(default=None, alias=get_settings().session_cookie_name),
) -> SessionIdentity:
    """Resolve and validate an opaque cookie against the database."""

    try:
        session_id = uuid.UUID(session_cookie) if session_cookie else None
    except ValueError:
        session_id = None
    auth_session = db.get(AuthSession, session_id) if session_id else None
    if auth_session is None or _as_utc(auth_session.expires_at) <= utc_now():
        if auth_session is not None:
            db.delete(auth_session)
            db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if auth_session.role not in {"researcher", "participant", "administrator"}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return SessionIdentity(
        session_id=auth_session.id,
        role=auth_session.role,  # type: ignore[arg-type]
        subject_id=auth_session.subject_id,
    )


def require_role(expected: Role):
    """Return a FastAPI dependency that enforces a server-resolved role."""

    def dependency(identity: SessionIdentity = Depends(get_identity)) -> SessionIdentity:
        if identity.role != expected:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return identity

    return dependency


def delete_auth_session(db: Session, session_id: uuid.UUID) -> None:
    db.execute(delete(AuthSession).where(AuthSession.id == session_id))
