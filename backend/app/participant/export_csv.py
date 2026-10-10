from __future__ import annotations
import csv
import io
import json
from typing import Iterable
from app.participant.models import ParticipantEvent

COLUMNS = ["seq", "type", "timestamp", "epochMs", "perfMs", "stageId", "detail"]


def export_session_csv(events: Iterable[ParticipantEvent]) -> str:
    """Build a CSV string for the given events (columns match the contract)."""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=COLUMNS)
    writer.writeheader()
    for event in events:
        detail = event.detail
        writer.writerow(
            {
                "seq": event.seq,
                "type": event.type,
                "timestamp": event.timestamp,
                "epochMs": event.epoch_ms,
                "perfMs": event.perf_ms,
                "stageId": event.stage_id or "",
                "detail": "" if detail is None else json.dumps(detail),
            }
        )
    return buffer.getvalue()



