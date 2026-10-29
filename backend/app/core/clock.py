"""Authoritative server clock helpers (UTC)."""

from __future__ import annotations

from datetime import datetime, timezone


def now() -> datetime:
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.now(timezone.utc)


def now_iso() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return now().isoformat()


def epoch_ms() -> int:
    """Return the current UTC time as integer milliseconds since the epoch."""
    return int(now().timestamp() * 1000)
