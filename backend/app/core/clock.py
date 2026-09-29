"""Authoritative UTC clock shared by events, recordings and stage transitions."""

from datetime import datetime, timezone


def utc_now() -> datetime:
    """Return a timezone-aware server timestamp with sub-second precision."""

    return datetime.now(timezone.utc)
