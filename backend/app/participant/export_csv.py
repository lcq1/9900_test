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


# Experiment-level export is generated only by the server.
EXPORT_COLUMNS = [
    "experiment_code",
    "experiment_name",
    "experiment_version",
    "participant_code",
    "participant_status",
    "run_id",
    "record_type",
    "record_id",
    "record_time_utc",
    "stage_id",
    "stage_position",
    "stage_type",
    "stage_title",
    "run_started_at_utc",
    "run_completed_at_utc",
    "consent_decision",
    "consent_text_version",
    "answer_json",
    "answer_outcome",
    "answer_entered_at_utc",
    "client_time_utc",
    "client_sequence",
    "event_type",
    "event_payload_json",
    "ai_role",
    "ai_content",
    "ai_provider",
    "ai_model",
    "signature_type",
    "signature_text",
    "signature_id",
    "media_type",
    "media_status",
    "media_id",
    "media_started_at_utc",
    "media_ended_at_utc",
]


def export_experiment_csv(db, experiment) -> str:
    from app.participant.models import ParticipantSession, Answer, Consent, Recording

    rows = []
    for session in (
        db.query(ParticipantSession)
        .filter(ParticipantSession.experiment_code == experiment.code)
        .all()
    ):
        base = {
            "experiment_code": experiment.code,
            "experiment_name": experiment.name,
            "participant_code": session.participant_code,
            "participant_status": "completed" if session.finished_at else "in_progress",
            "run_id": session.id,
        }

        def add(kind, record_id, **fields):
            rows.append({**base, "record_type": kind, "record_id": record_id, **fields})

        add(
            "run",
            session.id,
            record_time_utc=session.started_at,
            run_started_at_utc=session.started_at,
            run_completed_at_utc=session.finished_at or "",
        )
        for answer in db.query(Answer).filter(Answer.session_id == session.id).all():
            add(
                "answer",
                answer.id,
                answer_json=json.dumps(
                    {"component_id": answer.component_id, "value": answer.value},
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                answer_outcome="submitted",
            )
        for event in (
            db.query(ParticipantEvent)
            .filter(ParticipantEvent.session_id == session.id)
            .all()
        ):
            add(
                "event",
                event.id,
                stage_id=event.stage_id or "",
                client_time_utc=event.timestamp,
                client_sequence=event.seq,
                event_type=event.type,
                event_payload_json=json.dumps(
                    event.detail or {}, ensure_ascii=False, separators=(",", ":")
                ),
            )
        for consent in db.query(Consent).filter(Consent.session_id == session.id).all():
            add(
                "consent",
                consent.id,
                record_time_utc=consent.signed_at,
                consent_decision="accept",
                consent_text_version=consent.payload.get("consent_text_version", ""),
            )
        for recording in (
            db.query(Recording).filter(Recording.session_id == session.id).all()
        ):
            add(
                "recording",
                recording.id,
                record_time_utc=recording.created_at,
                media_id=recording.id,
                media_started_at_utc=recording.created_at,
            )
    rows.sort(
        key=lambda r: (
            r.get("participant_code", ""),
            r.get("record_time_utc", ""),
            r.get("client_sequence", -1),
            r["record_id"],
        )
    )
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=EXPORT_COLUMNS, lineterminator="\r\n")
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                key: (
                    "'" + value
                    if isinstance(value, str)
                    and value.lstrip().startswith(("=", "+", "-", "@"))
                    else value
                )
                for key, value in row.items()
            }
        )
    return "\ufeff" + buffer.getvalue()
