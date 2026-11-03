"""One server-side chat interface for permanent API keys and transitional WorkBuddy."""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from contextlib import aclosing
from dataclasses import dataclass
from typing import Protocol
import json

import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.researcher.ai_config import get_system_prompt
from contextvars import ContextVar
from contextlib import contextmanager

_request_settings = ContextVar("ai_request_settings", default=None)


def current_settings():
    return _request_settings.get() or settings


@contextmanager
def use_configuration(configuration):
    token = _request_settings.set(configuration)
    try:
        yield
    finally:
        _request_settings.reset(token)


@dataclass(frozen=True)
class ChatReply:
    content: str
    model: str


class ChatProvider(Protocol):
    def validate(self, key: str) -> None: ...
    async def chat(self, client: httpx.AsyncClient, key: str, payload: dict) -> ChatReply: ...
    def stream(self, key: str, payload: dict) -> AsyncIterator[dict]: ...
    def error(self, exc: Exception) -> HTTPException: ...


class OpenAICompatibleProvider:
    def validate(self, key: str) -> None:
        pass

    def headers(self, key: str) -> dict:
        return {"Authorization": f"Bearer {key}"}

    def streaming_payload(self, payload: dict) -> dict:
        return {**payload, "stream": True}

    async def chat(self, client: httpx.AsyncClient, key: str, payload: dict) -> ChatReply:
        return await _api_key_chat(client, key, payload)

    def stream(self, key: str, payload: dict) -> AsyncIterator[dict]:
        return _stream_completion(self, key, payload)

    def error(self, exc: Exception) -> HTTPException:
        return HTTPException(status_code=502, detail="The AI provider request failed. Please retry.")


class WorkBuddyProvider(OpenAICompatibleProvider):
    def validate(self, key: str) -> None:
        if not key.startswith("wbpk_"):
            raise HTTPException(status_code=503, detail="WorkBuddy requires its application's wbpk_ publishable key in AI_API_KEY.")

    def headers(self, key: str) -> dict:
        return {"x-wb-webapp-access-key": key}

    def streaming_payload(self, payload: dict) -> dict:
        return {**super().streaming_payload(payload), "stream_options": {"include_usage": True}}

    async def chat(self, client: httpx.AsyncClient, key: str, payload: dict) -> ChatReply:
        return await _workbuddy_chat(client, key, payload)

    def error(self, exc: Exception) -> HTTPException:
        if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (401, 403):
            return HTTPException(status_code=503, detail="WorkBuddy rejected server access. Check the application key and cloud access settings.")
        return super().error(exc)


PROVIDERS: dict[str, ChatProvider] = {}


def register_provider(name: str, provider: ChatProvider) -> None:
    if not name or len(name) > 32 or name != name.strip() or name in PROVIDERS:
        raise ValueError("Provider names must be unique and contain 1–32 characters")
    PROVIDERS[name] = provider


def get_provider() -> ChatProvider:
    provider = PROVIDERS.get(current_settings().ai_provider)
    if provider is None:
        raise HTTPException(status_code=503, detail="The AI provider is not registered. Please contact the researcher.")
    return provider


register_provider("openai_compatible", OpenAICompatibleProvider())
register_provider("workbuddy", WorkBuddyProvider())


async def chat(
    message: str,
    history: list[dict] | None = None,
    api_key: str | None = None,
) -> ChatReply:
    """Build the same context for either provider; credentials stay on the server."""
    key = validate_configuration(api_key)
    payload = make_payload(message, history)

    try:
        async with httpx.AsyncClient(timeout=current_settings().ai_timeout_seconds) as client:
            return await get_provider().chat(client, key, payload)
    except (
        httpx.HTTPError,
        ValueError,
        KeyError,
        IndexError,
        TypeError,
        AttributeError,
    ) as exc:
        raise provider_error(exc) from exc


def validate_configuration(api_key: str | None = None) -> str:
    """Reject unconfigured providers before starting a streaming response."""
    key = (api_key if api_key is not None else current_settings().ai_api_key or "").strip()
    if not key or not current_settings().ai_api_base.strip() or not current_settings().ai_model.strip():
        raise HTTPException(
            status_code=503,
            detail="The AI provider is not configured. Please contact the researcher.",
        )
    get_provider().validate(key)

    return key


def make_payload(message: str, history: list[dict] | None = None) -> dict:
    """Only the server owns the model, system prompt and context limits."""
    if not message.strip() or len(message) > current_settings().ai_max_prompt_chars:
        raise HTTPException(
            status_code=422,
            detail=f"Prompt must contain 1–{current_settings().ai_max_prompt_chars} characters.",
        )
    filtered = [
        item
        for item in history or []
        if item.get("role") in ("user", "assistant")
        and isinstance(item.get("content"), str)
    ]
    bounded = (
        filtered[-current_settings().ai_history_messages :]
        if current_settings().ai_history_messages
        else []
    )
    messages = [{"role": "system", "content": get_system_prompt(current_settings())}]
    messages.extend(
        {
            "role": item["role"],
            "content": item["content"][: current_settings().ai_history_message_chars],
        }
        for item in bounded
    )
    messages.append({"role": "user", "content": message})
    payload = {"model": current_settings().ai_model, "messages": messages}
    if current_settings().ai_temperature is not None:
        payload["temperature"] = current_settings().ai_temperature
    return payload


def provider_error(exc: Exception) -> HTTPException:
    # Adapters must return sanitized errors without upstream bodies or credentials.
    return get_provider().error(exc)


async def stream_chat(
    message: str, history: list[dict] | None = None, api_key: str | None = None
) -> AsyncIterator[dict]:
    """Normalize either provider to local delta/done events; cancellation closes HTTP."""
    key = validate_configuration(api_key)
    payload = make_payload(message, history)
    if not current_settings().ai_stream:
        reply = await chat(message, history, api_key=api_key) if api_key is not None else await chat(message, history)
        yield {"type": "delta", "text": reply.content, "model": reply.model}
        yield {"type": "done", "model": reply.model}
        return
    provider = get_provider()
    try:
        async with aclosing(provider.stream(key, payload)) as source:
            async for event in source:
                yield event
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
        raise provider.error(exc) from exc


async def _stream_completion(provider: OpenAICompatibleProvider, key: str, payload: dict) -> AsyncIterator[dict]:
    headers = provider.headers(key)
    payload = provider.streaming_payload(payload)
    model, has_text, finished = current_settings().ai_model, False, False
    try:
        async with httpx.AsyncClient(timeout=current_settings().ai_timeout_seconds) as client:
            async with client.stream(
                "POST",
                current_settings().ai_api_base,
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
                    for text in _text_deltas(chunk, "Invalid text delta"):
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
        current_settings().ai_api_base,
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
        "POST", current_settings().ai_api_base, json=payload, headers=headers
    ) as response:
        response.raise_for_status()
        if (
            not response.headers.get("content-type", "")
            .lower()
            .startswith("text/event-stream")
        ):
            raise ValueError("Expected a WorkBuddy event stream")
        parts: list[str] = []
        model = current_settings().ai_model
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
            parts.extend(_text_deltas(chunk, "Invalid assistant text"))
        content = "".join(parts)
        if not finished or not content.strip():
            raise ValueError("Incomplete or empty WorkBuddy reply")
        return ChatReply(content=content, model=model)


def _text_deltas(chunk: dict, error_detail: str) -> Iterator[str]:
    """Read the first choice; usage-only chunks may contain no choices."""
    for choice in chunk.get("choices", []):
        if choice.get("index", 0) != 0:
            continue
        text = choice.get("delta", {}).get("content")
        if text is not None:
            if not isinstance(text, str):
                raise ValueError(error_detail)
            yield text


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
        else (fallback or current_settings().ai_model)
    )
