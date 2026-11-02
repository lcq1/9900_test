"""Root and health-check routes."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["system"])


@router.get("/")
def root() -> dict[str, str]:
    """API root welcome message."""
    return {"message": "Beyond backend API", "status": "ok"}


@router.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}


@router.get("/time")
def server_time():
    from app.participant.time_sync import anchor
    return anchor()
