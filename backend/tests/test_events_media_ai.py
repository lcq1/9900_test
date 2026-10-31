"""AI chat, CSV export and event-timeline round-trip tests."""

from __future__ import annotations

import asyncio
import json
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.participant import ai_proxy
from app.researcher.ai_config import get_system_prompt


def chat_input(content="hello", conversation_id=None, request_id=None):
    return {
        "content": content,
        "conversationId": conversation_id or str(uuid4()),
        "requestId": request_id or str(uuid4()),
    }


def seed_ai_context(client, headers, stage_id, experiment_id, prompt, reply):
    from app.core import database
    from app.core.clock import now_iso
    from app.core.security import decode_access_token
    from app.participant.models import AIConversation, AIChatTurn

    conversation_id = str(uuid4())
    owner = decode_access_token(headers["Authorization"].split(" ")[1])
    with database.SessionLocal() as db:
        db.add(
            AIConversation(
                id=conversation_id,
                researcher_id=owner,
                experiment_id=experiment_id,
                stage_id=stage_id,
                created_at=now_iso(),
            )
        )
        db.flush()
        db.add(
            AIChatTurn(
                conversation_id=conversation_id,
                request_id=str(uuid4()),
                sequence=1,
                prompt=prompt,
                reply=reply,
                model="earlier-model",
                provider="openai_compatible",
                created_at=now_iso(),
            )
        )
        db.commit()
    return conversation_id


class FragmentedStream(httpx.AsyncByteStream):
    """Split frames and UTF-8 characters across transport chunks."""

    def __init__(self, content: str):
        self.content = content.encode("utf-8")

    async def __aiter__(self):
        for offset in range(0, len(self.content), 3):
            yield self.content[offset : offset + 3]


def stream_response(content: str, content_type: str = "text/event-stream"):
    return httpx.Response(
        200,
        headers={"Content-Type": content_type},
        stream=FragmentedStream(content),
    )


@pytest.fixture()
def ai_transport(monkeypatch):
    """Replace only model HTTP traffic; never call a real provider in pytest."""
    client_class = httpx.AsyncClient

    def install(handler):
        monkeypatch.setattr(
            ai_proxy.httpx,
            "AsyncClient",
            lambda **kwargs: client_class(
                transport=httpx.MockTransport(handler), **kwargs
            ),
        )

    return install


@pytest.mark.parametrize("provider", ["openai_compatible", "workbuddy"])
def test_stage_chat_uses_same_context_and_response_contract(
    client, auth_headers, monkeypatch, ai_transport, provider
):
    key = "wbpk_test_app" if provider == "workbuddy" else "sk_test_secret"
    monkeypatch.setattr(settings, "ai_provider", provider)
    monkeypatch.setattr(settings, "ai_api_key", key)
    monkeypatch.setattr(settings, "ai_stream", False)
    requests = []

    def upstream(request):
        requests.append(request)
        payload = json.loads(request.content)
        assert payload["model"] == "test-model"
        assert payload["messages"] == [
            {"role": "system", "content": get_system_prompt()},
            {"role": "user", "content": "previous question"},
            {"role": "assistant", "content": "previous answer"},
            {"role": "user", "content": "继续"},
        ]
        if provider == "workbuddy":
            assert request.headers["x-wb-webapp-access-key"] == key
            assert "Authorization" not in request.headers
            assert "Origin" not in request.headers
            assert payload["stream"] is True
            return stream_response(
                ": heartbeat\r\n\r\n"
                'data: {"model":"actual-model","choices":[{"index":0,"delta":{"role":"assistant"}}]}\r\n\r\n'
                'event: message\r\ndata: {"choices":[{"index":0,"delta":{"content":"你好"}}]}\r\n\r\n'
                'data: {"choices":[\r\ndata: {"index":0,"delta":{"content":"，世界"}}]}\r\n\r\n'
                'data: {"choices":[],"usage":{"total_tokens":10}}\r\n\r\n'
                "data: [DONE]\r\n\r\n"
            )
        assert request.headers["Authorization"] == f"Bearer {key}"
        assert "x-wb-webapp-access-key" not in request.headers
        assert "stream" not in payload
        return httpx.Response(
            200,
            json={
                "model": "actual-model",
                "choices": [{"message": {"content": "你好，世界"}}],
            },
        )

    ai_transport(upstream)
    experiment = client.post(
        "/api/experiments",
        json={
            "name": "AI provider",
            "stages": [
                {
                    "id": "provider-stage",
                    "name": "Question",
                    "type": "short_answer",
                    "features": {"ai": True},
                }
            ],
        },
        headers=auth_headers,
    )
    assert experiment.status_code == 201
    conversation_id = seed_ai_context(
        client,
        auth_headers,
        "provider-stage",
        experiment.json()["id"],
        "previous question",
        "previous answer",
    )
    response = client.post(
        "/api/participant/stages/provider-stage/ai-messages",
        json=chat_input("继续", conversation_id),
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert len(requests) == 1
    messages = response.json()
    assert [m["role"] for m in messages] == ["participant", "assistant"]
    assert [m["content"] for m in messages] == ["继续", "你好，世界"]
    assert all(m["model"] == "actual-model" for m in messages)
    assert messages[0]["server_time"] <= messages[1]["server_time"]
    assert key not in response.text


@pytest.mark.parametrize("provider", ["openai_compatible", "workbuddy"])
def test_missing_ai_credentials_do_not_send_requests(
    monkeypatch, ai_transport, provider
):
    monkeypatch.setattr(settings, "ai_provider", provider)
    ai_transport(lambda request: pytest.fail("Unconfigured AI must not send a request"))
    with pytest.raises(HTTPException) as error:
        asyncio.run(ai_proxy.chat("hello"))
    assert error.value.status_code == 503


@pytest.mark.parametrize("provider", ["openai_compatible", "workbuddy"])
@pytest.mark.parametrize("status", [401, 403, 429, 500])
def test_upstream_errors_are_explicit_and_do_not_leak_credentials(
    monkeypatch, ai_transport, provider, status
):
    key = "wbpk_private_test_value"
    monkeypatch.setattr(settings, "ai_provider", provider)
    monkeypatch.setattr(settings, "ai_api_key", key)
    ai_transport(
        lambda request: httpx.Response(status, json={"error": {"message": key}})
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(ai_proxy.chat("hello"))
    expected = 503 if provider == "workbuddy" and status in (401, 403) else 502
    assert error.value.status_code == expected
    assert key not in error.value.detail


@pytest.mark.parametrize("provider", ["openai_compatible", "workbuddy"])
def test_model_timeout_returns_retryable_failure(monkeypatch, ai_transport, provider):
    monkeypatch.setattr(settings, "ai_provider", provider)
    monkeypatch.setattr(settings, "ai_api_key", "wbpk_timeout_test")

    def timeout(request):
        raise httpx.ReadTimeout("upstream timed out", request=request)

    ai_transport(timeout)
    with pytest.raises(HTTPException) as error:
        asyncio.run(ai_proxy.chat("hello"))
    assert error.value.status_code == 502


@pytest.mark.parametrize(
    "body",
    [
        "not json",
        '{"choices":[]}',
        '{"choices":[{"message":{"content":null}}]}',
        '{"choices":[{"message":{"content":"  "}}]}',
    ],
)
def test_malformed_api_key_response_is_not_an_answer(monkeypatch, ai_transport, body):
    monkeypatch.setattr(settings, "ai_api_key", "sk_test")
    ai_transport(lambda request: httpx.Response(200, text=body))
    with pytest.raises(HTTPException) as error:
        asyncio.run(ai_proxy.chat("hello"))
    assert error.value.status_code == 502


@pytest.mark.parametrize(
    "body",
    [
        'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
        "data: [DONE]\n\n",
        'event: error\ndata: {"message":"provider failure"}\n\n',
        'data: {"error":{"message":"provider failure"}}\n\n',
        "data: invalid json\n\ndata: [DONE]\n\n",
        'data: {"choices":[{"delta":{"content":["invalid"]}}]}\n\ndata: [DONE]\n\n',
    ],
)
def test_broken_workbuddy_stream_never_returns_partial_success(
    monkeypatch, ai_transport, body
):
    monkeypatch.setattr(settings, "ai_provider", "workbuddy")
    monkeypatch.setattr(settings, "ai_api_key", "wbpk_test")
    ai_transport(lambda request: stream_response(body))
    with pytest.raises(HTTPException) as error:
        asyncio.run(ai_proxy.chat("hello"))
    assert error.value.status_code == 502


def test_workbuddy_rejects_non_stream_response(monkeypatch, ai_transport):
    monkeypatch.setattr(settings, "ai_provider", "workbuddy")
    monkeypatch.setattr(settings, "ai_api_key", "wbpk_test")
    ai_transport(lambda request: stream_response('{"choices":[]}', "application/json"))
    with pytest.raises(HTTPException) as error:
        asyncio.run(ai_proxy.chat("hello"))
    assert error.value.status_code == 502


def test_workbuddy_requires_publishable_key(monkeypatch, ai_transport):
    monkeypatch.setattr(settings, "ai_provider", "workbuddy")
    monkeypatch.setattr(settings, "ai_api_key", "sk_wrong_kind")
    ai_transport(
        lambda request: pytest.fail("Do not send a provider secret to WorkBuddy")
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(ai_proxy.chat("hello"))
    assert error.value.status_code == 503


def create_ai_stage(client, headers):
    response = client.post(
        "/api/experiments",
        headers=headers,
        json={
            "name": "Stream test",
            "stages": [
                {
                    "id": "stream-stage",
                    "name": "Design",
                    "type": "short_answer",
                    "features": {"ai": True},
                },
                {
                    "id": "disabled-stage",
                    "name": "No AI",
                    "type": "short_answer",
                    "features": {"ai": False},
                },
            ],
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.parametrize("provider", ["workbuddy", "openai_compatible"])
def test_browser_stream_uses_server_configuration_and_database_history(
    client, auth_headers, monkeypatch, ai_transport, provider
):
    experiment = create_ai_stage(client, auth_headers)
    conversation_id = seed_ai_context(
        client,
        auth_headers,
        "stream-stage",
        experiment["id"],
        "Earlier question",
        "Earlier answer",
    )
    key = "wbpk_stream_test_secret"
    monkeypatch.setattr(settings, "ai_provider", provider)
    monkeypatch.setattr(settings, "ai_api_key", key)
    monkeypatch.setattr(settings, "ai_system_prompt", "Server instructions")
    monkeypatch.setattr(settings, "ai_temperature", 0.3)
    calls = []

    def upstream(request):
        calls.append(request)
        payload = json.loads(request.content)
        assert str(request.url) == settings.ai_api_base
        assert payload["model"] == "test-model"
        assert payload["stream"] is True
        assert payload["temperature"] == 0.3
        assert payload["messages"] == [
            {"role": "system", "content": "Server instructions"},
            {"role": "user", "content": "Earlier question"},
            {"role": "assistant", "content": "Earlier answer"},
            {"role": "user", "content": "你好"},
        ]
        if provider == "workbuddy":
            assert request.headers["x-wb-webapp-access-key"] == key
            assert "Authorization" not in request.headers
        else:
            assert request.headers["Authorization"] == "Bearer " + key
            assert "x-wb-webapp-access-key" not in request.headers
        return stream_response(
            'data: {"model":"actual-model","choices":[{"delta":{"content":"你"}}]}\n\n'
            'data: {"choices":[{"delta":{"content":"好"}}]}\n\n'
            "data: [DONE]\n\n"
        )

    ai_transport(upstream)
    response = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=auth_headers,
        json=chat_input("你好", conversation_id),
    )
    assert response.status_code == 200, response.text
    assert response.headers["x-accel-buffering"] == "no"
    events = [json.loads(line) for line in response.text.splitlines()]
    assert [event["type"] for event in events] == ["delta", "delta", "done"]
    assert "".join(event.get("text", "") for event in events) == "你好"
    assert all(event["model"] == "actual-model" for event in events)
    assert all(event["server_time"] for event in events)
    assert key not in response.text
    assert len(calls) == 1


def test_ai_stream_auth_and_stage_checks_happen_before_upstream(
    client, auth_headers, ai_transport, monkeypatch
):
    create_ai_stage(client, auth_headers)
    monkeypatch.setattr(settings, "ai_api_key", "sk_test")
    ai_transport(lambda _: pytest.fail("Rejected requests must never call a provider"))
    assert (
        client.post(
            "/api/participant/stages/stream-stage/ai-stream", json=chat_input()
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/participant/stages/disabled-stage/ai-stream",
            headers=auth_headers,
            json=chat_input(),
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/participant/stages/stream-stage/ai-stream",
            headers=auth_headers,
            json=chat_input("x" * 4001),
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/participant/stages/stream-stage/ai-stream",
            headers=auth_headers,
            json=chat_input("  "),
        ).status_code
        == 422
    )


def test_ai_stream_honors_json_only_setting(
    client, auth_headers, monkeypatch, ai_transport
):
    create_ai_stage(client, auth_headers)
    monkeypatch.setattr(settings, "ai_api_key", "sk_test")
    monkeypatch.setattr(settings, "ai_stream", False)

    def upstream(request):
        assert "stream" not in json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "model": "json-model",
                "choices": [{"message": {"content": "JSON reply"}}],
            },
        )

    ai_transport(upstream)
    response = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=auth_headers,
        json=chat_input(),
    )
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events[0] == {
        **events[0],
        "type": "delta",
        "text": "JSON reply",
        "model": "json-model",
    }
    assert events[1]["type"] == "done"


def test_ai_stream_reports_partial_failure_without_leaking_provider_body(
    client, auth_headers, monkeypatch, ai_transport
):
    create_ai_stage(client, auth_headers)
    monkeypatch.setattr(settings, "ai_api_key", "sk_secret_value")
    ai_transport(
        lambda _: stream_response(
            'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n'
            'event: error\ndata: {"message":"sk_secret_value"}\n\n'
        )
    )
    response = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=auth_headers,
        json=chat_input(),
    )
    events = [json.loads(line) for line in response.text.splitlines()]
    assert [event["type"] for event in events] == ["delta", "error"]
    assert events[-1]["retryable"] is True
    assert "sk_secret_value" not in response.text


def test_context_limits_are_enforced_on_server(monkeypatch):
    monkeypatch.setattr(settings, "ai_history_messages", 2)
    monkeypatch.setattr(settings, "ai_history_message_chars", 3)
    payload = ai_proxy.make_payload(
        "now",
        [
            {"role": "user", "content": "discard"},
            {"role": "user", "content": "abcdef"},
            {"role": "assistant", "content": "uvwxyz"},
        ],
    )
    assert payload["messages"][1:] == [
        {"role": "user", "content": "abc"},
        {"role": "assistant", "content": "uvw"},
        {"role": "user", "content": "now"},
    ]
    monkeypatch.setattr(settings, "ai_history_messages", 0)
    assert (
        len(
            ai_proxy.make_payload("now", [{"role": "user", "content": "discard"}])[
                "messages"
            ]
        )
        == 2
    )


def test_ai_public_config_never_exposes_secrets_or_system_prompt(
    client, auth_headers, monkeypatch
):
    monkeypatch.setattr(settings, "ai_api_key", "sk_secret_value")
    monkeypatch.setattr(settings, "ai_system_prompt", "private system prompt")
    response = client.get("/api/ai/config", headers=auth_headers)
    assert response.json() == {"model": "test-model", "configured": True}
    assert client.get("/api/ai/config").status_code == 401


def test_context_is_loaded_from_database_without_round_trip_history(
    client, auth_headers, monkeypatch, ai_transport
):
    from app.core import database
    from app.participant.models import AIChatTurn

    create_ai_stage(client, auth_headers)
    monkeypatch.setattr(settings, "ai_api_key", "sk_test")
    seen = []

    def upstream(request):
        seen.append(json.loads(request.content)["messages"])
        answer = f"answer-{len(seen)}"
        return stream_response(
            "data: "
            + json.dumps(
                {"model": "actual-model", "choices": [{"delta": {"content": answer}}]}
            )
            + "\n\ndata: [DONE]\n\n"
        )

    ai_transport(upstream)
    conversation = str(uuid4())
    first = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=auth_headers,
        json=chat_input("question-1", conversation),
    )
    second = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=auth_headers,
        json=chat_input("question-2", conversation),
    )
    assert first.status_code == second.status_code == 200
    assert seen[0] == [
        {"role": "system", "content": get_system_prompt()},
        {"role": "user", "content": "question-1"},
    ]
    assert seen[1][1:] == [
        {"role": "user", "content": "question-1"},
        {"role": "assistant", "content": "answer-1"},
        {"role": "user", "content": "question-2"},
    ]
    assert "question-1" not in second.text and "answer-1" not in second.text
    with database.SessionLocal() as db:
        turns = db.query(AIChatTurn).order_by(AIChatTurn.sequence).all()
        assert [(t.prompt, t.reply) for t in turns] == [
            ("question-1", "answer-1"),
            ("question-2", "answer-2"),
        ]


def test_retries_replay_only_current_turn_without_calling_provider_again(
    client, auth_headers, monkeypatch, ai_transport
):
    from app.core import database
    from app.participant.models import AIChatTurn

    create_ai_stage(client, auth_headers)
    monkeypatch.setattr(settings, "ai_api_key", "sk_test")
    calls = []

    def upstream(request):
        calls.append(request)
        return stream_response(
            'data: {"choices":[{"delta":{"content":"saved reply"}}]}\n\ndata: [DONE]\n\n'
        )

    ai_transport(upstream)
    body = chat_input("same prompt")
    first = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=auth_headers,
        json=body,
    )
    assert first.status_code == 200
    monkeypatch.setattr(
        settings, "ai_api_key", None
    )  # A replay needs no provider access.
    replay = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=auth_headers,
        json=body,
    )
    assert replay.status_code == 200
    assert '"text": "saved reply"' in replay.text
    assert len(calls) == 1
    conflict = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=auth_headers,
        json={**body, "content": "different prompt"},
    )
    assert conflict.status_code == 409
    with database.SessionLocal() as db:
        assert db.query(AIChatTurn).count() == 1


@pytest.mark.parametrize(
    "field,value",
    [("history", []), ("context", "old text"), ("messages", []), ("model", "override")],
)
def test_chat_contract_rejects_browser_supplied_context(
    client, auth_headers, ai_transport, field, value
):
    ai_transport(lambda _: pytest.fail("Invalid contracts must not call providers"))
    response = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=auth_headers,
        json={**chat_input(), field: value},
    )
    assert response.status_code == 422


def test_failed_turn_is_not_saved_or_used_as_history(
    client, auth_headers, monkeypatch, ai_transport
):
    from app.core import database
    from app.participant.models import AIChatTurn, AIConversation

    create_ai_stage(client, auth_headers)
    monkeypatch.setattr(settings, "ai_api_key", "sk_test")
    seen = []

    def upstream(request):
        seen.append(json.loads(request.content)["messages"])
        if len(seen) == 1:
            return stream_response(
                'data: {"choices":[{"delta":{"content":"incomplete"}}]}\n\n'
            )
        return stream_response(
            'data: {"choices":[{"delta":{"content":"complete"}}]}\n\ndata: [DONE]\n\n'
        )

    ai_transport(upstream)
    body = chat_input("hello")
    failed = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=auth_headers,
        json=body,
    )
    assert '"type": "error"' in failed.text
    with database.SessionLocal() as db:
        assert db.query(AIChatTurn).count() == db.query(AIConversation).count() == 0
    retry = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=auth_headers,
        json=body,
    )
    assert '"type": "done"' in retry.text
    assert seen[0] == seen[1]


def test_conversations_are_isolated_by_stage_and_researcher(
    client, auth_headers, monkeypatch, ai_transport
):
    from tests.conftest import register_and_login

    create_ai_stage(client, auth_headers)
    monkeypatch.setattr(settings, "ai_api_key", "sk_test")
    calls = []

    def upstream(request):
        calls.append(json.loads(request.content)["messages"])
        return stream_response(
            'data: {"choices":[{"delta":{"content":"private reply"}}]}\n\ndata: [DONE]\n\n'
        )

    ai_transport(upstream)
    conversation = str(uuid4())
    assert (
        client.post(
            "/api/participant/stages/stream-stage/ai-stream",
            headers=auth_headers,
            json=chat_input("private question", conversation),
        ).status_code
        == 200
    )
    token = register_and_login(client, email="other-ai@example.com")
    other = {"Authorization": "Bearer " + token}
    create_ai_stage(client, other)  # Same stage string, different owner/experiment.
    blocked = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=other,
        json=chat_input("hello", conversation),
    )
    assert blocked.status_code == 404
    response = client.post(
        "/api/participant/stages/stream-stage/ai-stream",
        headers=other,
        json=chat_input("fresh question"),
    )
    assert response.status_code == 200
    assert calls[1][1:] == [{"role": "user", "content": "fresh question"}]
    assert len(calls) == 2


def test_parallel_requests_for_same_conversation_are_rejected(
    client, auth_headers, monkeypatch, ai_transport
):
    from app.core import database
    from app.core.security import decode_access_token
    from app.participant.repository import prepare_ai_turn

    experiment = create_ai_stage(client, auth_headers)
    monkeypatch.setattr(settings, "ai_api_key", "sk_test")
    ai_transport(
        lambda _: pytest.fail("A concurrent request must not generate a reply")
    )
    conversation = str(uuid4())
    with database.SessionLocal() as first:
        prepare_ai_turn(
            first,
            conversation_id=conversation,
            request_id=str(uuid4()),
            content="first",
            researcher_id=decode_access_token(
                auth_headers["Authorization"].split(" ")[1]
            ),
            experiment_id=experiment["id"],
            stage_id="stream-stage",
        )
        second = client.post(
            "/api/participant/stages/stream-stage/ai-stream",
            headers=auth_headers,
            json=chat_input("second", conversation),
        )
        assert second.status_code == 409
        first.rollback()


def test_cancelled_turn_rolls_back_context_and_releases_lock(
    client, auth_headers, monkeypatch
):
    from app.core import database
    from app.core.security import decode_access_token
    from app.participant.repository import prepare_ai_turn
    from app.participant.service import generate_ai_turn
    from app.participant.models import AIChatTurn, AIConversation

    experiment = create_ai_stage(client, auth_headers)
    closed = []

    async def provider(message, history=None):
        try:
            yield {"type": "delta", "text": "partial", "model": "test-model"}
            yield {"type": "done", "model": "test-model"}
        finally:
            closed.append(True)

    monkeypatch.setattr(ai_proxy, "stream_chat", provider)
    body = chat_input()
    with database.SessionLocal() as db:
        prepared = prepare_ai_turn(
            db,
            conversation_id=body["conversationId"],
            request_id=body["requestId"],
            content="hello",
            researcher_id=decode_access_token(
                auth_headers["Authorization"].split(" ")[1]
            ),
            experiment_id=experiment["id"],
            stage_id="stream-stage",
        )

        async def cancel():
            source = generate_ai_turn(db, prepared)
            assert (await anext(source))["text"] == "partial"
            await source.aclose()

        asyncio.run(cancel())
        assert db.query(AIChatTurn).count() == db.query(AIConversation).count() == 0
    assert closed == [True]


def test_closing_stream_closes_provider_connection(monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", "sk_test")
    closed = []

    class ProviderStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'data: {"choices":[{"delta":{"content":"first"}}]}\n\n'
            yield b"data: [DONE]\n\n"

        async def aclose(self):
            closed.append(True)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        ai_proxy.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(
                    200,
                    headers={"Content-Type": "text/event-stream"},
                    stream=ProviderStream(),
                )
            ),
            **kwargs,
        ),
    )

    async def cancel():
        stream = ai_proxy.stream_chat("hello")
        assert (await anext(stream))["text"] == "first"
        await stream.aclose()

    asyncio.run(cancel())
    assert closed == [True]


def test_unsupported_provider_is_rejected_at_configuration_time():
    from pydantic import ValidationError
    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(_env_file=None, ai_provider="unsupported")


def test_stage_ai_disabled_and_missing_provider_are_explicit(client, auth_headers):
    from app.core.config import settings

    old = settings.ai_api_key
    settings.ai_api_key = None
    try:
        client.post(
            "/api/experiments",
            json={
                "name": "AI",
                "stages": [
                    {
                        "id": "on",
                        "name": "AI",
                        "type": "short_answer",
                        "features": {"ai": True},
                    },
                    {
                        "id": "off",
                        "name": "No AI",
                        "type": "short_answer",
                        "features": {"ai": False},
                    },
                ],
            },
            headers=auth_headers,
        )
        assert (
            client.post(
                "/api/participant/stages/off/ai-messages",
                json=chat_input(),
                headers=auth_headers,
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/participant/stages/on/ai-messages",
                json=chat_input(),
                headers=auth_headers,
            ).status_code
            == 503
        )
        assert (
            client.post(
                "/api/participant/stages/on/ai-messages", json=chat_input()
            ).status_code
            == 401
        )
    finally:
        settings.ai_api_key = old


def test_csv_export_endpoint_matches_columns(client, auth_headers):
    experiment = client.post(
        "/api/experiments",
        json={"name": "E", "code": "CSV1", "stages": []},
        headers=auth_headers,
    ).json()
    payload = {
        "experimentCode": experiment["code"],
        "participantCode": "abc",
        "answers": [],
        "events": [
            {
                "seq": 0,
                "type": "timer_tick",
                "timestamp": "t0",
                "epochMs": 1,
                "perfMs": 1,
            }
        ],
    }
    r = client.post("/api/participant/sessions", json=payload, headers=auth_headers)
    session_id = r.json()["id"]

    r = client.get(f"/api/participant/sessions/{session_id}/csv", headers=auth_headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    lines = r.text.strip().splitlines()
    assert lines[0] == "seq,type,timestamp,epochMs,perfMs,stageId,detail"
    assert len(lines) == 2  # header + 1 event
    assert "timer_tick" in lines[1]


def test_event_timeline_roundtrip_preserves_order(client, auth_headers):
    experiment = client.post(
        "/api/experiments",
        json={"name": "E", "code": "TL1", "stages": []},
        headers=auth_headers,
    ).json()
    events = [
        {
            "seq": i,
            "type": f"type_{i}",
            "timestamp": f"ts_{i}",
            "epochMs": i * 100,
            "perfMs": i,
            "stageId": f"s{i}" if i % 2 == 0 else None,
            "detail": {"i": i},
        }
        for i in range(5)
    ]
    payload = {
        "experimentCode": experiment["code"],
        "participantCode": "abc",
        "answers": [],
        "events": events,
    }
    r = client.post("/api/participant/sessions", json=payload, headers=auth_headers)
    session_id = r.json()["id"]
    r = client.get(f"/api/participant/sessions/{session_id}", headers=auth_headers)
    got = r.json()["events"]
    assert [e["seq"] for e in got] == [0, 1, 2, 3, 4]
    assert got[0]["detail"] == {"i": 0}
    assert got[1]["stageId"] is None


def test_existing_ai_panel_fallback_contract(client, auth_headers, monkeypatch):
    from app.participant import ai_proxy

    async def reply(message, history=None):
        raise AssertionError("Legacy context endpoint must not call a provider")

    monkeypatch.setattr(ai_proxy, "chat", reply)
    response = client.post(
        "/api/ai/chat",
        headers=auth_headers,
        json={"message": "Help with a bridge", "context": "Earlier discussion"},
    )
    assert response.status_code == 410


def test_time_sync_anchor_uses_one_core_clock_read(monkeypatch):
    from datetime import datetime, timezone
    from app.core import clock
    from app.participant import time_sync

    instant = datetime(2026, 10, 27, 0, 0, 0, 123456, tzinfo=timezone.utc)
    calls = []

    def fixed_now():
        calls.append(True)
        return instant

    monkeypatch.setattr(clock, "now", fixed_now)
    anchor = time_sync.anchor()
    assert len(calls) == 1
    assert anchor == {
        "iso": instant.isoformat(),
        "epochMs": int(instant.timestamp() * 1000),
    }
    assert time_sync.server_now_iso() == clock.now_iso()
    assert time_sync.server_epoch_ms() == clock.epoch_ms()

