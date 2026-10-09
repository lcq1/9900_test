"""Default AI system-prompt configuration for the chat proxy."""
from __future__ import annotations

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful research assistant for UX and usability studies. "
    "Provide concise, practical, evidence-based guidance."
)


def get_system_prompt() -> str:
    """Return the default system prompt used for AI chat."""
    return DEFAULT_SYSTEM_PROMPT
