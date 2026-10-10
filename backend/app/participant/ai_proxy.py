from __future__ import annotations
import httpx
from app.core.config import settings


def _mock_reply(message: str) -> str:
    return (
        f"Thanks for your message: {message!r}. Here is one way to approach that: "
        "clarify the constraints first, then compare two alternatives. "
        "(mock reply; set AI_API_KEY to enable a real model.)"
    )


async def chat(message: str, context: str | None = None) -> str:
    """Return an AI reply for ``message`` (with optional ``context``)."""
    if settings.ai_api_key:
        return await _chat_real(message, context)
    return _mock_reply(message)


async def _chat_real(message: str, context: str | None) -> str:
    messages: list[dict[str, str]] = []
    if context:
        messages.append({"role": "system", "content": context})
    messages.append({"role": "user", "content": message})

    payload = {
        "model": "gpt-4o-mini",
        "messages": messages,
        "temperature": 0.7,
    }
    headers = {
        "Authorization": f"Bearer {settings.ai_api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(settings.ai_api_base, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"]
