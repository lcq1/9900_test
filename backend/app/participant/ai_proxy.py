"""One server-side chat interface for permanent API keys and transitional WorkBuddy."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
import json

import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.researcher.ai_config import get_system_prompt


@dataclass(frozen=True)
class ChatReply:
    content: str
    model: str


async def chat(
    message: str,
    history: list[dict] | None = None,
) -> ChatReply:
    """Build the same context for either provider; credentials stay on the server."""
    key = validate_configuration()
    payload = make_payload(message, history)

    try:
        async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
            if settings.ai_provider == "workbuddy":
                return await _workbuddy_chat(client, key, payload)
            return await _api_key_chat(client, key, payload)
    except (
        httpx.HTTPError,
        ValueError,
        KeyError,
        IndexError,
        TypeError,
        AttributeError,
    ) as exc:
        raise provider_error(exc) from exc


def validate_configuration() -> str:
    """Reject unconfigured providers before starting a streaming response."""
    key = (settings.ai_api_key or "").strip()
    if not key or not settings.ai_api_base.strip() or not settings.ai_model.strip():
        raise HTTPException(
            status_code=503,
            detail="The AI provider is not configured. Please contact the researcher.",
        )
    if settings.ai_provider == "workbuddy" and not key.startswith("wbpk_"):
        raise HTTPException(
            status_code=503,
            detail="WorkBuddy requires its application's wbpk_ publishable key in AI_API_KEY.",
        )

    return key


def make_payload(message: str, history: list[dict] | None = None) -> dict:
    """Only the server owns the model, system prompt and context limits."""
    if not message.strip() or len(message) > settings.ai_max_prompt_chars:
        raise HTTPException(
            status_code=422,
            detail=f"Prompt must contain 1–{settings.ai_max_prompt_chars} characters.",
        )
    filtered = [
        item
        for item in history or []
        if item.get("role") in ("user", "assistant")
        and isinstance(item.get("content"), str)
    ]
    bounded = (
        filtered[-settings.ai_history_messages :]
        if settings.ai_history_messages
        else []
    )
    messages = [{"role": "system", "content": get_system_prompt()}]
    messages.extend(
        {
            "role": item["role"],
            "content": item["content"][: settings.ai_history_message_chars],
        }
        for item in bounded
    )
    messages.append({"role": "user", "content": message})
    payload = {"model": settings.ai_model, "messages": messages}
    if settings.ai_temperature is not None:
        payload["temperature"] = settings.ai_temperature
    return payload


def provider_error(exc: Exception) -> HTTPException:
    # Never include upstream bodies, URLs or credentials in client errors.
    if (
        settings.ai_provider == "workbuddy"
        and isinstance(exc, httpx.HTTPStatusError)
        and exc.response.status_code in (401, 403)
    ):
        return HTTPException(
            status_code=503,
            detail="WorkBuddy rejected server access. Check the application key and cloud access settings.",
        )
    return HTTPException(
        status_code=502, detail="The AI provider request failed. Please retry."
    )


async def stream_chat(
    message: str, history: list[dict] | None = None
) -> AsyncIterator[dict]:
    """Normalize either provider to local delta/done events; cancellation closes HTTP."""
    key = validate_configuration()
    payload = make_payload(message, history)
    if not settings.ai_stream:
        reply = await chat(message, history)
        yield {"type": "delta", "text": reply.content, "model": reply.model}
        yield {"type": "done", "model": reply.model}
        return
    headers = (
        {"x-wb-webapp-access-key": key}
        if settings.ai_provider == "workbuddy"
        else {"Authorization": f"Bearer {key}"}
    )
    payload["stream"] = True
    if settings.ai_provider == "workbuddy":
        payload["stream_options"] = {"include_usage": True}
    model, has_text, finished = settings.ai_model, False, False
    try:
        async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
            async with client.stream(
                "POST",
                settings.ai_api_base,
                json=payload,
                headers={**headers, "Accept": "text/event-stream"},
            ) as response:
                response.raise_for_status()
                if (
                    not response.headers.get("content-type", "")
                    .lower()
                    .startswith("text/event-stream")
                ):
                    raise ValueError(
                        "Expected an event stream; set AI_STREAM=false for JSON-only providers"
                    )
                async for event, data in _sse_events(response):
                    if event == "error":
                        raise ValueError("Provider stream error")
                    if event not in ("", "message"):
                        continue
                    if data == "[DONE]":
                        finished = True
                        break
                    chunk = json.loads(data)
                    if "error" in chunk:
                        raise ValueError("Provider stream error")
                    model = _model_name(chunk, model)
                    for choice in chunk.get("choices", []):
                        if choice.get("index", 0) != 0:
                            continue
                        text = choice.get("delta", {}).get("content")
                        if text is not None:
                            if not isinstance(text, str):
                                raise ValueError("Invalid text delta")
                            if text:
                                has_text = True
                                yield {"type": "delta", "text": text, "model": model}
        if not finished or not has_text:
            raise ValueError("Incomplete or empty reply")
        yield {"type": "done", "model": model}
    except (
        httpx.HTTPError,
        ValueError,
        KeyError,
        IndexError,
        TypeError,
        AttributeError,
    ) as exc:
        raise provider_error(exc) from exc


async def _api_key_chat(
    client: httpx.AsyncClient, key: str, payload: dict
) -> ChatReply:
    response = await client.post(
        settings.ai_api_base,
        json=payload,
        headers={"Authorization": f"Bearer {key}"},
    )
    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"]["content"]
    if not isinstance(content, str) or not content.strip():
        raise ValueError("Missing assistant text")
    return ChatReply(content=content, model=_model_name(data))


async def _workbuddy_chat(
    client: httpx.AsyncClient, key: str, payload: dict
) -> ChatReply:
    """Translate the shared API-key configuration to WorkBuddy's wire protocol."""
    headers = {"x-wb-webapp-access-key": key, "Accept": "text/event-stream"}
    payload = {**payload, "stream": True, "stream_options": {"include_usage": True}}
    async with client.stream(
        "POST", settings.ai_api_base, json=payload, headers=headers
    ) as response:
        response.raise_for_status()
        if (
            not response.headers.get("content-type", "")
            .lower()
            .startswith("text/event-stream")
        ):
            raise ValueError("Expected a WorkBuddy event stream")
        parts: list[str] = []
        model = settings.ai_model
        finished = False
        async for event, data in _sse_events(response):
            if event == "error":
                raise ValueError("WorkBuddy stream error")
            if event not in ("", "message"):
                continue
            if data == "[DONE]":
                finished = True
                break
            chunk = json.loads(data)
            if "error" in chunk:
                raise ValueError("WorkBuddy stream error")
            model = _model_name(chunk, model)
            # Usage-only chunks can have an empty choices array.
            for choice in chunk.get("choices", []):
                if choice.get("index", 0) != 0:
                    continue
                text = choice.get("delta", {}).get("content")
                if text is not None:
                    if not isinstance(text, str):
                        raise ValueError("Invalid assistant text")
                    parts.append(text)
        content = "".join(parts)
        if not finished or not content.strip():
            raise ValueError("Incomplete or empty WorkBuddy reply")
        return ChatReply(content=content, model=model)


async def _sse_events(response: httpx.Response) -> AsyncIterator[tuple[str, str]]:
    """Decode events independently of HTTP chunk boundaries and heartbeat comments."""
    event = ""
    data: list[str] = []
    async for line in response.aiter_lines():
        if not line:
            if data:
                yield event, "\n".join(data)
            event, data = "", []
        elif not line.startswith(":"):
            field, separator, value = line.partition(":")
            if separator and value.startswith(" "):
                value = value[1:]
            if field == "event":
                event = value
            elif field == "data":
                data.append(value)
    if data:
        yield event, "\n".join(data)


def _model_name(data: dict, fallback: str | None = None) -> str:
    model = data.get("model")
    return (
        model
        if isinstance(model, str) and model.strip()
        else (fallback or settings.ai_model)
    )
