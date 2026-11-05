"""Default AI prompt and private per-experiment credentials for the chat proxy."""

from __future__ import annotations
from app.core.config import settings

GOOGLE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
GOOGLE_MODEL = "gemini-3.5-flash-lite"

AI_PARAMETERS = ('provider', 'api_base', 'model', 'api_key', 'stream', 'timeout_seconds',
                 'temperature', 'system_prompt', 'max_prompt_chars', 'history_messages', 'history_message_chars')

DEFAULT_SYSTEM_PROMPT = (
    "You are the built-in AI assistant of Beyond, a research platform that studies "
    "how engineering-design students work with AI during a design task. "
    "Reply in plain text only, keeping replies concise unless asked for more detail. "
    "Help the student reason about assumptions, trade-offs and next steps rather "
    "than handing over a finished solution. Ask for clarification when needed. "
    "Never claim to see the student's screen, files, camera or microphone."
)


def get_system_prompt(configuration=None) -> str:
    """Return the default system prompt used for AI chat."""
    return ((configuration or settings).ai_system_prompt or "").strip() or DEFAULT_SYSTEM_PROMPT


def credential_id(experiment_id: str) -> str:
    from uuid import uuid5, NAMESPACE_URL
    return str(uuid5(NAMESPACE_URL, "experiment-ai-key:" + experiment_id))


def get_experiment_config(db, experiment_id: str) -> dict:
    """Read a private server record outside session and experiment export namespaces."""
    from app.participant.models import ParticipantEvent
    record = db.get(ParticipantEvent, credential_id(experiment_id))
    return dict(record.detail or {}) if record else {}


def get_experiment_key(db, experiment_id: str) -> str | None:
    from app.researcher.models import Experiment
    return resolve_experiment_config(db, experiment_id).ai_api_key if db.get(Experiment, experiment_id) else None


def common_scope(researcher_id: str) -> str:
    return 'common:' + researcher_id


def uses_common(overrides: dict) -> bool:
    return overrides.get('use_common', not any(name in overrides for name in AI_PARAMETERS))


def resolve_common_config(db, researcher_id: str):
    overrides = get_experiment_config(db, common_scope(researcher_id))
    return apply_ai_overrides(overrides)


def apply_ai_overrides(overrides: dict):
    """Apply supported AI parameters without copying configuration-source metadata."""
    updates = {'ai_' + key: value for key, value in overrides.items() if key in AI_PARAMETERS}
    if updates.get('ai_provider', settings.ai_provider) == 'google':
        updates.update(ai_api_base=GOOGLE_ENDPOINT, ai_model=GOOGLE_MODEL)
    server_endpoint = GOOGLE_ENDPOINT if settings.ai_provider == 'google' else settings.ai_api_base
    if (
        updates.get('ai_api_base', server_endpoint) != server_endpoint
        or updates.get('ai_provider', settings.ai_provider) != settings.ai_provider
    ):
        updates.setdefault('ai_api_key', None)
    return settings.model_copy(update=updates)


def resolve_experiment_config(db, experiment_id: str):
    from app.researcher.models import Experiment
    overrides = get_experiment_config(db, experiment_id)
    experiment = db.get(Experiment, experiment_id)
    if experiment and experiment.owner_id and uses_common(overrides):
        return resolve_common_config(db, experiment.owner_id)
    return apply_ai_overrides(overrides)


def save_experiment_key(db, experiment, key: str | None) -> None:
    save_experiment_config(db, experiment, {"api_key": key, "use_common": False} if key is not None else None)


def save_experiment_config(db, experiment, changes: dict | None) -> None:
    from app.researcher.models import Experiment
    # Serialize updates without changing experiment content or publication versions.
    db.query(Experiment).filter_by(id=experiment.id).with_for_update().one()
    _save_config_record(db, experiment.id, changes)


def save_common_config(db, researcher_id: str, changes: dict | None) -> None:
    from app.researcher.models import Researcher
    db.query(Researcher).filter_by(id=researcher_id).with_for_update().one()
    _save_config_record(db, common_scope(researcher_id), changes)


def _save_config_record(db, scope: str, changes: dict | None):
    from app.participant.models import ParticipantEvent
    from app.core.clock import now_iso
    record_id = credential_id(scope)
    record = db.get(ParticipantEvent, record_id)
    if changes is None:
        if record:
            db.delete(record)
    elif record:
        previous = record.detail or {}
        candidate = {**previous, **changes}
        if previous.get('api_key') and 'api_key' not in changes:
            before, after = apply_ai_overrides(previous), apply_ai_overrides(candidate)
            if (before.ai_provider, before.ai_api_base) != (after.ai_provider, after.ai_api_base):
                from fastapi import HTTPException
                raise HTTPException(status_code=422, detail="Enter a new API key when changing provider or endpoint.")
        record.detail = candidate
        record.timestamp = now_iso()
    else:
        db.add(ParticipantEvent(id=record_id, session_id=record_id, type="server.ai_key",
                                timestamp=now_iso(), seq=0, detail=changes))
    db.commit()
