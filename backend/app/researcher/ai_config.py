"""Default AI system-prompt configuration for the chat proxy."""

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
