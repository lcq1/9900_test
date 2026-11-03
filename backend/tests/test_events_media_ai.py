"""AI chat, CSV export and event-timeline round-trip tests."""

from __future__ import annotations

import asyncio
import json
from uuid import uuid4
from pathlib import Path

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


def test_common_ai_settings_follow_source_and_preserve_independent_credentials(client, auth_headers, monkeypatch, ai_transport):
    from tests.conftest import register_and_login
    from app.core import database
    from app.researcher.ai_config import get_experiment_config
    monkeypatch.setattr(settings, 'ai_api_key', None)
    experiments = []
    for index in range(2):
        result = client.post('/api/experiments', headers=auth_headers, json={
            'name': f'Common study {index}', 'stages': [{'id': f'common-stage-{index}', 'name': 'Question',
            'type': 'short_answer', 'features': {'ai': True}}]})
        assert result.status_code == 201
        experiments.append(result.json())
    paths = [f"/api/experiments/{experiment['id']}/ai-key" for experiment in experiments]
    assert all(client.get(path, headers=auth_headers).json()['useCommon'] for path in paths)
    common = {'provider': 'openai_compatible', 'apiBase': 'https://common.example/v1/chat/completions',
              'model': 'common-A', 'apiKey': 'shared-test-key', 'stream': False}
    saved = client.patch('/api/workspace/ai-config', headers=auth_headers, json=common)
    assert saved.status_code == 200 and 'shared-test-key' not in saved.text
    assert client.get(paths[0], headers=auth_headers).json()['model'] == 'common-A'
    assert client.patch(paths[0], headers=auth_headers, json={'useCommon': True, 'model': 'invalid-edit'}).status_code == 422
    assert client.patch(paths[1], headers=auth_headers, json={'useCommon': False}).status_code == 200
    independent = {'model': 'independent-model', 'apiBase': 'https://independent.example/v1/chat/completions', 'apiKey': 'independent-test-key'}
    assert client.patch(paths[1], headers=auth_headers, json=independent).status_code == 200
    assert client.patch('/api/workspace/ai-config', headers=auth_headers, json={'model': 'common-B', 'apiKey': 'shared-new-key'}).status_code == 200
    assert client.get(paths[0], headers=auth_headers).json()['model'] == 'common-B'
    assert client.get(paths[1], headers=auth_headers).json()['model'] == 'independent-model'
    source = client.patch(paths[1], headers=auth_headers, json={'useCommon': True}).json()
    assert source['useCommon'] and source['model'] == 'common-B'
    with database.SessionLocal() as db:
        assert get_experiment_config(db, experiments[1]['id'])['api_key'] == 'independent-test-key'
    restored = client.patch(paths[1], headers=auth_headers, json={'useCommon': False}).json()
    assert restored['model'] == 'independent-model' and restored['hasCustomKey']
    captured = []
    def upstream(request):
        captured.append((request.headers['Authorization'], json.loads(request.content)['model']))
        return httpx.Response(200, json={'choices': [{'message': {'content': 'reply'}}]})
    ai_transport(upstream)
    for index in range(2):
        response = client.post(f'/api/participant/stages/common-stage-{index}/ai-stream', headers=auth_headers, json=chat_input())
        assert response.status_code == 200 and '"type": "done"' in response.text
    assert captured == [('Bearer shared-new-key', 'common-B'), ('Bearer independent-test-key', 'independent-model')]
    other = {'Authorization': 'Bearer ' + register_and_login(client, email='common-other@example.com')}
    assert client.get('/api/workspace/ai-config', headers=other).json()['model'] == settings.ai_model
    assert client.patch('/api/workspace/ai-config', headers=other, json={'model': 'other-common'}).status_code == 200
    assert client.get('/api/workspace/ai-config', headers=auth_headers).json()['model'] == 'common-B'
    assert client.get(paths[0], headers=other).status_code == 404
    assert client.get('/api/workspace/ai-config').status_code == 401
    assert client.delete('/api/workspace/ai-config', headers=auth_headers).status_code == 200
    assert client.get(paths[0], headers=auth_headers).json()['model'] == settings.ai_model
    assert client.get(paths[1], headers=auth_headers).json()['model'] == 'independent-model'


@pytest.mark.parametrize("streaming", [False, True])
def test_experiment_ai_parameters_reach_each_provider(client, auth_headers, monkeypatch, ai_transport, streaming):
    from app.core import database
    from app.participant.models import AIChatTurn
    monkeypatch.setattr(settings, "ai_api_key", None)
    captured = []
    def upstream(request):
        payload = json.loads(request.content)
        captured.append((request, payload))
        if streaming or request.url.host == 'provider-1.example':
            return stream_response('data: {"choices":[{"delta":{"content":"reply"}}]}\n\ndata: [DONE]\n\n')
        return httpx.Response(200, json={"choices": [{"message": {"content": "reply"}}]})
    ai_transport(upstream)
    for index, provider in enumerate(('openai_compatible', 'workbuddy')):
        stage_id = f'parameters-{index}'
        experiment = client.post('/api/experiments', headers=auth_headers, json={
            "name": f'Parameters {index}', "stages": [{"id": stage_id, "name": "Question",
            "type": "short_answer", "features": {"ai": True}}]}).json()
        path = f"/api/experiments/{experiment['id']}/ai-key"
        key = 'wbpk_private-test-key' if index else 'private-test-key'
        parameters = {"provider": provider, "apiKey": key,
                      "apiBase": f'https://provider-{index}.example/v1/chat/completions',
                      "model": f'custom-model-{index}', "stream": streaming, "timeoutSeconds": 120,
                      "temperature": 0.5, "systemPrompt": f'Instructions {index}',
                      "maxPromptChars": 20, "historyMessages": 2, "historyMessageChars": 5}
        response = client.patch(path, headers=auth_headers, json=parameters)
        assert response.status_code == 200, response.text
        assert key not in response.text and 'apiKey' not in response.json()
        assert response.json()['hasCustomSettings'] is True
        assert response.json()['apiBase'] == parameters['apiBase']
        # An omitted key must preserve the secret while other parameters change.
        response = client.patch(path, headers=auth_headers, json={"model": f'updated-model-{index}'})
        assert response.status_code == 200 and response.json()['hasCustomKey'] is True
        config = client.get('/api/ai/config', params={"stageId": stage_id}, headers=auth_headers).json()
        assert config['configured'] is True and config['model'] == f'updated-model-{index}'
        for invalid in ({"apiBase": 'file:///private/key'}, {"apiBase": 'https://user:password@example.com/v1'},
                        {"timeoutSeconds": 0}, {"temperature": 3}, {"historyMessages": 101}, {"model": ' '}):
            assert client.patch(path, headers=auth_headers, json=invalid).status_code == 422
        result = client.post(f'/api/participant/stages/{stage_id}/ai-stream', headers=auth_headers, json=chat_input())
        assert result.status_code == 200 and '"type": "done"' in result.text, result.text
        request, payload = captured[-1]
        assert str(request.url) == parameters['apiBase']
        assert request.extensions['timeout']['read'] == 120
        assert payload['model'] == f'updated-model-{index}' and payload['temperature'] == 0.5
        assert payload['messages'][0] == {"role": "system", "content": f'Instructions {index}'}
        header = 'x-wb-webapp-access-key' if index else 'Authorization'
        assert request.headers[header] == (key if index else f'Bearer {key}')
        rejected = client.post(f'/api/participant/stages/{stage_id}/ai-stream', headers=auth_headers, json=chat_input('x' * 21))
        assert rejected.status_code == 422
        reset = client.delete(path, headers=auth_headers).json()
        assert reset['useCommon'] is True and reset['model'] == settings.ai_model
    with database.SessionLocal() as db:
        turns = db.query(AIChatTurn).all()
        assert {(turn.model, turn.provider) for turn in turns} == {
            ('updated-model-0', 'openai_compatible'), ('updated-model-1', 'workbuddy')}
    assert settings.ai_api_key is None and settings.ai_model == 'test-model'


def test_ai_configuration_contexts_are_isolated_and_bound_history(monkeypatch):
    async def run():
        async def task(index):
            config = settings.model_copy(update={"ai_model": f'model-{index}',
                "ai_system_prompt": f'prompt-{index}', "ai_history_messages": 1,
                "ai_history_message_chars": 3, "ai_max_prompt_chars": 10})
            with ai_proxy.use_configuration(config):
                await asyncio.sleep(0)
                payload = ai_proxy.make_payload('new', [
                    {"role": "user", "content": "older"}, {"role": "assistant", "content": "abcdef"}])
                assert payload['model'] == f'model-{index}'
                assert payload['messages'] == [{"role": "system", "content": f'prompt-{index}'},
                    {"role": "assistant", "content": "abc"}, {"role": "user", "content": "new"}]
                with pytest.raises(HTTPException):
                    ai_proxy.make_payload('x' * 11)
        await asyncio.gather(task(0), task(1))
    asyncio.run(run())
    assert ai_proxy.current_settings() is settings


def test_experiment_settings_can_replace_incomplete_server_defaults(client, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, 'ai_api_base', '')
    monkeypatch.setattr(settings, 'ai_model', '')
    monkeypatch.setattr(settings, 'ai_api_key', None)
    experiment = create_ai_stage(client, auth_headers)
    path = f"/api/experiments/{experiment['id']}/ai-key"
    loaded = client.get(path, headers=auth_headers)
    assert loaded.status_code == 200 and loaded.json()['configured'] is False
    saved = client.patch(path, headers=auth_headers, json={
        'apiBase': 'https://ai.example/v1/chat/completions', 'model': 'experiment-model',
        'apiKey': 'test-key', 'provider': 'openai_compatible'})
    assert saved.status_code == 200 and saved.json()['configured'] is True


@pytest.mark.parametrize("streaming", [False, True])
def test_experiment_api_keys_are_private_and_used_by_chat(client, auth_headers, monkeypatch, ai_transport, streaming):
    from app.core import database
    from app.researcher.ai_config import get_experiment_key
    from app.participant.export_csv import export_experiment_xlsx
    from app.researcher.models import Experiment
    from tests.conftest import register_and_login
    monkeypatch.setattr(settings, "ai_api_key", None)
    monkeypatch.setattr(settings, "ai_stream", streaming)
    experiments = []
    for index in range(2):
        response = client.post("/api/experiments", headers=auth_headers, json={
            "name": f"Key study {index}", "stages": [{"id": f"key-stage-{index}",
            "name": "Question", "type": "short_answer", "features": {"ai": True}}]})
        assert response.status_code == 201
        experiments.append(response.json())
    keys = ["experiment-key-one", "experiment-key-two"]
    for experiment, key in zip(experiments, keys):
        path = f"/api/experiments/{experiment['id']}/ai-key"
        saved = client.patch(path, headers=auth_headers, json={"apiKey": key})
        assert saved.status_code == 200 and saved.json()["hasCustomKey"] is True
        assert key not in saved.text and key not in client.get(path, headers=auth_headers).text
        assert client.patch(path, headers=auth_headers, json={"apiKey": " "}).status_code == 422
    requests = []
    def upstream(request):
        requests.append(request.headers["Authorization"])
        if streaming:
            return stream_response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n')
        return httpx.Response(200, json={"model": "test-model", "choices": [{"message": {"content": "ok"}}]})
    ai_transport(upstream)
    for index in range(2):
        config = client.get(f"/api/ai/config?stageId=key-stage-{index}", headers=auth_headers)
        assert config.status_code == 200 and config.json()["configured"] is True
        path = f"/api/participant/stages/key-stage-{index}/ai-stream"
        response = client.post(path, headers=auth_headers, json=chat_input())
        assert response.status_code == 200 and '"type": "done"' in response.text
    assert requests == [f"Bearer {key}" for key in keys]
    assert settings.ai_api_key is None
    other = {"Authorization": "Bearer " + register_and_login(client, email="key-other@example.com")}
    path = f"/api/experiments/{experiments[0]['id']}/ai-key"
    for method in (client.get, client.delete):
        assert method(path, headers=other).status_code == 404
    assert client.patch(path, headers=other, json={"apiKey": "foreign-key"}).status_code == 404
    with database.SessionLocal() as db:
        for experiment, key in zip(experiments, keys):
            assert get_experiment_key(db, experiment["id"]) == key
            import io
            from openpyxl import load_workbook
            book = load_workbook(io.BytesIO(export_experiment_xlsx(db, db.get(Experiment, experiment["id"]))))
            text = str([[cell.value for row in sheet for cell in row] for sheet in book])
            assert key not in text
    monkeypatch.setattr(settings, "ai_api_key", "server-default-key")
    removed = client.delete(path, headers=auth_headers)
    assert removed.status_code == 200 and removed.json()["hasCustomKey"] is False
    response = client.post('/api/participant/stages/key-stage-0/ai-stream', headers=auth_headers, json=chat_input())
    assert response.status_code == 200 and requests[-1] == "Bearer server-default-key"
    assert client.delete(f"/api/experiments/{experiments[1]['id']}", headers=auth_headers).status_code == 204
    with database.SessionLocal() as db:
        assert get_experiment_key(db, experiments[1]["id"]) is None


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


def test_provider_name_length_is_validated_at_configuration_time():
    from pydantic import ValidationError
    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(_env_file=None, ai_provider="")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, ai_provider="x" * 33)


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

    r = client.get(f"/api/participant/sessions/{session_id}/csv?view=activity", headers=auth_headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    import csv, io
    from app.participant.export_csv import ACTIVITY_COLUMNS
    reader = csv.DictReader(io.StringIO(r.content.decode("utf-8-sig")))
    assert reader.fieldnames == ACTIVITY_COLUMNS
    rows = list(reader)
    assert len(rows) == 1
    assert rows[0]["Original event type"] == "timer_tick"


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


def test_recording_chunks_retry_and_order(tmp_path, monkeypatch):
    from app.core import storage
    from app.participant.recording import append_chunk
    monkeypatch.setattr(storage, "STORAGE_DIR", str(tmp_path))
    append_chunk("recordings/example.webm", 0, b"header")
    append_chunk("recordings/example.webm", 0, b"header")
    append_chunk("recordings/example.webm", 6, b"tail")
    assert (tmp_path / "recordings/example.webm").read_bytes() == b"headertail"
    with pytest.raises(HTTPException) as error:
        append_chunk("recordings/example.webm", 1, b"wrong")
    assert error.value.status_code == 409


def test_recording_mode_contract():
    from app.researcher.schemas import Stage
    from pydantic import ValidationError
    values = dict(id="stage", name="Task", type="short_answer")
    assert Stage(**values).recording_mode == "manual"
    assert Stage(**values, recordingMode="auto").model_dump(by_alias=True)["recordingMode"] == "auto"
    with pytest.raises(ValidationError):
        Stage(**values, recordingMode="invalid")


def test_recording_upload_session_roundtrip(client, auth_headers, tmp_path, monkeypatch):
    from app.core import storage
    monkeypatch.setattr(storage, "STORAGE_DIR", str(tmp_path))
    experiment = client.post("/api/experiments", headers=auth_headers, json={
        "name": "Recording test", "stages": [{"id": "capture", "name": "Capture",
        "type": "short_answer", "features": {"screenRecording": True}, "recordingMode": "auto"}]
    }).json()
    payload = {"experimentCode": experiment["code"], "participantCode": "abc", "answers": [], "events": []}
    session = client.post("/api/participant/sessions", headers=auth_headers, json=payload).json()
    path = f"/api/participant/sessions/{session['id']}/recordings/{uuid4()}"
    params = {"stage_id": "capture", "kind": "screen", "offset": 0, "mime": "video/webm"}
    response = client.post(path, headers=auth_headers, params=params, content=b"header")
    assert response.status_code == 200
    assert client.post(path, headers=auth_headers, params=params, content=b"header").status_code == 200
    params["offset"] = 6
    assert client.post(path, headers=auth_headers, params=params, content=b"tail").status_code == 200
    download = f"/api/participant/sessions/{session['id']}/recordings/{response.json()['recordingId']}"
    assert client.get(download, headers=auth_headers).content == b"headertail"
    assert client.get(download).status_code == 401
    final = client.post("/api/participant/sessions", headers=auth_headers,
        json={**payload, "sessionId": session["id"], "finishedAt": "2026-10-30T12:00:00Z",
              "events": [{"seq": 1, "type": "recording_start", "stageId": "capture", "timestamp": "2026-10-30T11:59:59Z",
                          "epochMs": 0, "perfMs": 0, "detail": {"kind": "screen", "status": "active"}}]})
    assert final.status_code == 201
    assert final.json()["id"] == session["id"]
    assert client.post(path, headers=auth_headers, params=params, content=b"tail").status_code == 409


@pytest.mark.parametrize("required,self_active,screen_active,allowed", [
    (False, False, False, True), (False, True, False, True),
    (True, False, False, False), (True, True, False, True),
    (True, False, True, False), (True, True, True, True),
])
def test_recording_gate_combinations(required, self_active, screen_active, allowed):
    from app.participant.service import validate_stage
    stage = {"recordingRequired": required, "components": []}
    recording = {"self": self_active, "screen": screen_active}
    if allowed:
        validate_stage(stage, [], recording)
    else:
        with pytest.raises(HTTPException) as error:
            validate_stage(stage, [], recording)
        assert error.value.status_code == 422


@pytest.mark.parametrize("enabled,kind,recording,allowed", [
    (False, "short_answer", {}, True),
    (True, "short_answer", {}, False),
    (True, "short_answer", {"screen": False}, False),
    (True, "short_answer", {"self": True}, False),
    (True, "short_answer", {"screen": "true"}, False),
    (True, "short_answer", {"screen": True}, True),
    (True, "consent", {}, True),
])
def test_configured_screen_recording_gate(enabled, kind, recording, allowed):
    from app.participant.service import validate_stage
    stage = {"type": kind, "components": [], "features": {"screenRecording": enabled},
             "recordingMode": "manual", "recordingRequired": False}
    if allowed:
        validate_stage(stage, [], recording)
    else:
        with pytest.raises(HTTPException) as error:
            validate_stage(stage, [], recording)
        assert error.value.status_code == 422
        assert "Screen recording" in error.value.detail


def test_finished_session_cannot_skip_configured_screen_recording(monkeypatch):
    from types import SimpleNamespace
    from app.participant import service
    from app.participant.schemas import ParticipantSessionSubmit
    stage = {"id": "stage", "type": "short_answer", "components": [],
             "features": {"screenRecording": True}}
    monkeypatch.setattr(service, "lookup_experiment", lambda *args: SimpleNamespace(stages=[stage]))
    payload = ParticipantSessionSubmit.model_validate({
        "experimentCode": "STUDY", "participantCode": "P001", "answers": [], "events": [],
        "finishedAt": "2026-11-02T00:00:00Z",
    })
    with pytest.raises(HTTPException) as error:
        service.submit_session(None, payload)
    assert error.value.status_code == 422
    assert "Screen recording" in error.value.detail


def test_recording_metadata_does_not_commit_upload_transaction():
    from unittest.mock import MagicMock
    from app.participant.recording import create_recording
    db = MagicMock()
    create_recording(db, session_id="session", filename="video.webm", path="recordings/video.webm")
    db.flush.assert_called_once()
    db.commit.assert_not_called()


@pytest.mark.parametrize("streaming", [False, True])
def test_registered_provider_needs_no_business_flow_changes(monkeypatch, streaming):
    class CustomProvider:
        def validate(self, key):
            assert key == "test-only-key"
        async def chat(self, client, key, payload):
            assert payload["messages"][-1]["content"] == "hello"
            return ai_proxy.ChatReply("custom reply", "custom-model")
        async def stream(self, key, payload):
            yield {"type": "delta", "text": "custom reply", "model": "custom-model"}
            yield {"type": "done", "model": "custom-model"}
        def error(self, exc):
            return HTTPException(status_code=502, detail="Custom provider failed")
    monkeypatch.setattr(ai_proxy, "PROVIDERS", dict(ai_proxy.PROVIDERS))
    ai_proxy.register_provider("custom", CustomProvider())
    monkeypatch.setattr(settings, "ai_provider", "custom")
    monkeypatch.setattr(settings, "ai_api_key", "test-only-key")
    monkeypatch.setattr(settings, "ai_stream", streaming)
    async def collect():
        return [event async for event in ai_proxy.stream_chat("hello")]
    events = asyncio.run(collect())
    assert events[0]["text"] == "custom reply"
    assert events[-1]["type"] == "done"
    with pytest.raises(ValueError):
        ai_proxy.register_provider("custom", CustomProvider())


def test_unknown_provider_is_unavailable_without_preventing_startup(monkeypatch):
    from app.core.config import Settings
    config = Settings(_env_file=None, ai_provider="not_registered")
    monkeypatch.setattr(settings, "ai_provider", config.ai_provider)
    monkeypatch.setattr(settings, "ai_api_key", "test-only-key")
    with pytest.raises(HTTPException) as error:
        ai_proxy.validate_configuration()
    assert error.value.status_code == 503


def test_provider_stream_closes_on_consumer_cancellation(monkeypatch):
    closed = []
    class Provider(ai_proxy.OpenAICompatibleProvider):
        async def stream(self, key, payload):
            try:
                yield {"type": "delta", "text": "partial", "model": "test"}
                yield {"type": "done", "model": "test"}
            finally:
                closed.append(True)
    monkeypatch.setitem(ai_proxy.PROVIDERS, "cancellation_test", Provider())
    monkeypatch.setattr(settings, "ai_provider", "cancellation_test")
    monkeypatch.setattr(settings, "ai_api_key", "test-only-key")
    async def consume():
        source = ai_proxy.stream_chat("hello")
        await anext(source)
        await source.aclose()
    asyncio.run(consume())
    assert closed == [True]


def test_event_accepts_fractional_performance_time():
    from app.participant.schemas import ParticipantEvent
    event = ParticipantEvent(seq=0, type="pause", timestamp="2026-11-01T00:00:00Z", epochMs=1, perfMs=1.75)
    assert event.perf_ms == 2


def test_storage_location_switch_preserves_old_files(tmp_path, monkeypatch):
    from app.core import storage
    from app.participant.recording import append_chunk
    monkeypatch.setattr(storage, "STORAGE_DIR", str(tmp_path / "legacy"))
    monkeypatch.setattr(settings, "storage_locations", {"new": str(tmp_path / "new")})
    storage.check_location("new")
    old = storage.logical_reference("legacy", "recordings/old.webm")
    new = storage.logical_reference("new", "recordings/new.webm")
    append_chunk(old, 0, b"old")
    append_chunk(new, 0, b"new")
    assert Path(storage._safe_local_path(old)).read_bytes() == b"old"
    assert Path(storage._safe_local_path(new)).read_bytes() == b"new"
    asyncio.run(storage.delete(new))
    assert not Path(storage._safe_local_path(new)).exists()
    for invalid in ("new:../escape", "new:/absolute", "unknown:file", "new:C:/escape", "new:..\\escape"):
        with pytest.raises(ValueError): storage._safe_local_path(invalid)


@pytest.mark.parametrize("configured", ["", "custom-data", "absolute"])
def test_local_storage_directory(tmp_path, monkeypatch, configured):
    from app.core import storage
    from app.participant.recording import append_chunk

    backend = tmp_path / "backend"
    target = tmp_path / "external" if configured == "absolute" else backend / (configured or "storage")
    monkeypatch.setattr(storage, "_PROJECT_ROOT", str(backend))
    monkeypatch.setattr(storage, "STORAGE_DIR", str(backend / "storage"))
    monkeypatch.setattr(settings, "local_storage_dir", str(target) if configured == "absolute" else configured)
    monkeypatch.setattr(settings, "storage_locations", {})
    monkeypatch.setattr(settings, "storage_default_location", "legacy")
    monkeypatch.setattr(settings, "onedrive_client_id", None)
    reference = storage.logical_reference(None, "recordings/sample.webm")
    append_chunk(reference, 0, b"first")
    append_chunk(reference, 5, b"second")
    assert asyncio.run(storage.download(reference)) == b"firstsecond"
    assert (target / "recordings/sample.webm").read_bytes() == b"firstsecond"
    material = storage.logical_reference(None, "materials/sample.txt")
    asyncio.run(storage.upload(material, b"material"))
    assert (target / "materials/sample.txt").read_bytes() == b"material"
    with pytest.raises(ValueError):
        storage._safe_local_path("legacy:../outside")
    asyncio.run(storage.delete(reference))
    assert not (target / "recordings/sample.webm").exists()


def test_session_csv_contains_saved_answers_and_media_references():
    import csv, io
    from types import SimpleNamespace
    from app.participant.export_csv import build_csv
    study = SimpleNamespace(name="Study", code="S", stages=[])
    session = SimpleNamespace(id="session", participant_code="P001",
                              started_at="2026-11-01T00:00:00Z", finished_at=None)
    answer = SimpleNamespace(session_id="session", component_id="question", value="中文,逗号\n换行")
    media = SimpleNamespace(id="media", session_id="session", filename="recording.webm",
                            created_at="2026-11-01T00:00:00Z")
    rows = list(csv.DictReader(io.StringIO(build_csv(study, [session], [answer]).lstrip("\ufeff"))))
    assert rows[0]["Unmatched question – question"] == answer.value
    rows = list(csv.DictReader(io.StringIO(build_csv(
        study, [session], recordings=[media], view="activity").lstrip("\ufeff"))))
    assert rows[0]["Recording download reference"] == "/api/participant/sessions/session/recordings/media"


def test_storage_materials_and_results_are_owner_scoped(client, auth_headers, tmp_path, monkeypatch):
    from app.core import storage
    monkeypatch.setattr(storage, "STORAGE_DIR", str(tmp_path / "legacy"))
    monkeypatch.setattr(settings, "storage_locations", {"archive": str(tmp_path / "archive")})
    options = client.get("/api/workspace/storage", headers=auth_headers).json()
    assert options["locations"] == ["legacy", "archive"]
    assert str(tmp_path) not in json.dumps(options)
    assert client.patch("/api/workspace/storage", headers=auth_headers, json={"location": "outside"}).status_code == 422
    assert client.patch("/api/workspace/storage", headers=auth_headers, json={"location": "archive"}).status_code == 200
    assert client.get("/api/workspace/storage", headers=auth_headers).json()["location"] == "archive"
    study = client.post("/api/experiments", headers=auth_headers, json={"name": "Materials", "stages": [{"id": "material-stage", "name": "Task", "type": "short_answer", "components": []}]}).json()
    upload_path = f"/api/experiments/{study['id']}/stages/material-stage/materials"
    uploaded = client.post(upload_path, headers=auth_headers, params={"filename": "instructions.txt"}, content="Study instructions".encode())
    assert uploaded.status_code == 200
    material = uploaded.json()
    assert material["reference"].startswith("archive:")
    download = upload_path + "/" + material["id"]
    client.patch("/api/workspace/storage", headers=auth_headers, json={"location": "legacy"})
    assert client.get(download, headers=auth_headers).content == b"Study instructions"
    session = client.post("/api/participant/sessions", headers=auth_headers, json={"experimentCode": study["code"], "participantCode": "abc"}).json()
    assert len(client.get("/api/participant/sessions", headers=auth_headers, params={"experiment_code": study["code"]}).json()) == 1
    client.post("/api/auth/register", json={"name": "Other", "email": "other-isolation@example.com", "password": "password123"})
    login = client.post("/api/auth/login", json={"email": "other-isolation@example.com", "password": "password123"}).json()
    other = {"Authorization": "Bearer " + login["token"]}
    assert client.get(download, headers=other).status_code == 404
    assert client.get("/api/participant/sessions", headers=other).json() == []
    assert client.get("/api/participant/sessions", headers=other, params={"experiment_code": study["code"]}).status_code == 404
    assert client.get(f"/api/participant/sessions/{session['id']}/csv", headers=other).status_code == 404



def test_delete_material_permissions_failures_and_published_files(client, auth_headers, tmp_path, monkeypatch):
    from app.core import storage, database
    from app.researcher.models import Experiment
    from app.researcher import repository as versions
    from tests.conftest import register_and_login
    monkeypatch.setattr(storage, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "local_storage_dir", "")
    study = client.post("/api/experiments", headers=auth_headers, json={"name": "Delete materials", "stages": [
        {"id": "material-stage", "name": "Task", "type": "short_answer", "components": []}]}).json()
    path = f"/api/experiments/{study['id']}/stages/material-stage/materials"
    material = client.post(path, headers=auth_headers, params={"filename": "test.pdf"}, content=b"test").json()
    target = Path(storage._safe_local_path(material["reference"]))
    url = path + "/" + material["id"]
    other = {"Authorization": "Bearer " + register_and_login(client, email="delete-other@example.com")}
    assert client.delete(url).status_code == 401
    assert client.delete(url, headers=other).status_code == 404
    assert client.delete(path + "/missing", headers=auth_headers).status_code == 404
    original_delete = storage.delete
    async def fail_delete(*args):
        raise OSError("unavailable")
    monkeypatch.setattr(storage, "delete", fail_delete)
    assert client.delete(url, headers=auth_headers).status_code == 503
    assert client.get(url, headers=auth_headers).content == b"test"
    monkeypatch.setattr(storage, "delete", original_delete)
    assert client.delete(url, headers=auth_headers).json() == {"deleted": True}
    assert not target.exists()
    assert client.get(url, headers=auth_headers).status_code == 404
    assert client.get(f"/api/experiments/{study['id']}", headers=auth_headers).json()["stages"][0]["materials"] == []
    assert client.delete(url, headers=auth_headers).status_code == 404
    material = client.post(path, headers=auth_headers, params={"filename": "published.pdf"}, content=b"historical").json()
    url = path + "/" + material["id"]
    with database.SessionLocal() as db:
        exp = db.get(Experiment, study["id"])
        exp.status = "Live"
        versions.ensure_baseline(db, exp)
        db.commit()
    assert client.delete(url, headers=auth_headers).status_code == 200
    assert client.get(f"/api/experiments/{study['id']}", headers=auth_headers).json()["status"] == "Draft"
    assert Path(storage._safe_local_path(material["reference"])).read_bytes() == b"historical"
    with database.SessionLocal() as db:
        changes = versions.experiment_history(db, db.get(Experiment, study["id"]))
        assert not any(e.type == "server.changed" for e in changes)

    with database.SessionLocal() as db:
        db.get(Experiment, study["id"]).status = "Live"
        db.commit()
    upload = client.post(path, headers=auth_headers, params={"filename": "updated.pdf"}, content=b"updated")
    assert upload.status_code == 200
    assert client.get(f"/api/experiments/{study['id']}", headers=auth_headers).json()["status"] == "Draft"



def test_consent_has_no_study_materials(client, auth_headers):
    from app.core import database
    from app.researcher.models import Experiment
    study = client.post("/api/experiments", headers=auth_headers, json={"name": "Consent only", "stages": [
        {"id": "consent", "name": "Consent", "type": "Consent", "components": []}]}).json()
    path = f"/api/experiments/{study['id']}/stages/consent/materials"
    response = client.post(path, headers=auth_headers, params={"filename": "instructions.pdf"}, content=b"pdf")
    assert response.status_code == 422
    with database.SessionLocal() as db:
        exp = db.get(Experiment, study["id"])
        stages = [dict(stage) for stage in exp.stages]
        stages[0]["materials"] = [{"id": "legacy", "name": "old.pdf", "reference": "legacy:materials/owner/legacy"}]
        exp.stages = stages
        db.commit()
    assert client.get(path + "/legacy", headers=auth_headers).status_code == 404



@pytest.mark.parametrize("invalid", [-0.5, float("nan"), float("inf"), "invalid"])
def test_event_rejects_invalid_epoch_times(invalid):
    from app.participant.schemas import ParticipantEvent
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        ParticipantEvent(seq=0, type="pause", timestamp="2026-11-03T00:00:00Z", epochMs=invalid, perfMs=1)


def test_finish_accepts_fractional_synchronized_event_times(client, auth_headers):
    from tests.test_admin_export import published_stages
    study = client.post("/api/experiments", headers=auth_headers, json={"name": "Fractional clock", "stages": published_stages()}).json()
    assert client.patch(f"/api/experiments/{study['id']}", headers=auth_headers,
                        json={"publish": True, "publishRequestId": str(uuid4())}).status_code == 200
    codes = {"experimentCode": study["code"], "participantCode": "P001"}
    access = client.post("/api/participant/access", json=codes).json()
    actor = {"X-Participant-Token": access["token"]}
    sid = str(uuid4())
    assert client.post("/api/participant/sessions/start", headers=actor, json={**codes, "sessionId": sid}).status_code == 200
    response = client.post("/api/participant/sessions", headers=actor, json={**codes, "sessionId": sid,
        "finishedAt": "2026-11-03T00:00:01Z", "events": [{"seq": 0, "type": "consent", "stageId": "consent",
        "timestamp": "2026-11-03T00:00:00Z", "epochMs": 1793664000000.5, "perfMs": 100.25,
        "detail": {"accepted": True}}]})
    assert response.status_code == 201, response.text
    assert response.json()["finishedAt"] is not None
    assert response.json()["events"][0]["epochMs"] == 1793664000001
