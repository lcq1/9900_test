"""Default AI prompt and private per-experiment credentials for the chat proxy."""

from __future__ import annotations
from app.core.config import settings

DEFAULT_SYSTEM_PROMPT = (
    "You are the built-in AI assistant of Beyond, a research platform that studies "
    "how engineering-design students work with AI during a design task. "
    "Reply in plain text only, keeping replies concise unless asked for more detail. "
    "Help the student reason about assumptions, trade-offs and next steps rather "
    "than handing over a finished solution. Ask for clarification when needed. "
    "Never claim to see the student's screen, files, camera or microphone."
)


def get_system_prompt() -> str:
    """Return the default system prompt used for AI chat."""
    return (settings.ai_system_prompt or "").strip() or DEFAULT_SYSTEM_PROMPT


def credential_id(experiment_id: str) -> str:
    from uuid import uuid5, NAMESPACE_URL
    return str(uuid5(NAMESPACE_URL, "experiment-ai-key:" + experiment_id))


def get_experiment_key(db, experiment_id: str) -> str | None:
    """Read a private server record outside session and experiment export namespaces."""
    from app.participant.models import ParticipantEvent
    record = db.get(ParticipantEvent, credential_id(experiment_id))
    return (record.detail or {}).get("api_key") if record else None


def save_experiment_key(db, experiment, key: str | None) -> None:
    from app.participant.models import ParticipantEvent
    from app.core.clock import now_iso
    from app.researcher.models import Experiment
    # Serialize updates without changing experiment content or publication versions.
    db.query(Experiment).filter_by(id=experiment.id).with_for_update().one()
    record_id = credential_id(experiment.id)
    record = db.get(ParticipantEvent, record_id)
    if key is None:
        if record:
            db.delete(record)
    elif record:
        record.detail = {"api_key": key}
        record.timestamp = now_iso()
    else:
        db.add(ParticipantEvent(id=record_id, session_id=record_id, type="server.ai_key",
                                timestamp=now_iso(), seq=0, detail={"api_key": key}))
    db.commit()
