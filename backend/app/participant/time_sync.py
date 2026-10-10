from __future__ import annotations
from datetime import datetime, timezone


def server_now_iso() -> str:
    """Return the current server time as an ISO-8601 UTC string."""
    return datetime.now(timezone.utc).isoformat()


def server_epoch_ms() -> int:
    """Return the current server time as integer milliseconds since epoch."""
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def anchor() -> dict[str, object]:
    """Return a clock anchor payload (now + epoch) for client synchronisation."""
    return {
        "iso": server_now_iso(),
        "epochMs": server_epoch_ms(),
    }
